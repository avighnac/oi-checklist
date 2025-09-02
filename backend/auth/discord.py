from flask import request, jsonify, redirect, current_app
from requests_oauthlib import OAuth2Session
import secrets
import uuid
import os
from database.db import get_db

# Discord OAuth config
DISCORD_CLIENT_ID = os.getenv("DISCORD_CLIENT_ID")
DISCORD_CLIENT_SECRET = os.getenv("DISCORD_CLIENT_SECRET")
DISCORD_CALLBACK_URL = os.getenv("BACKEND_URL") + "/auth/discord/callback"
DISCORD_AUTH_URL = "https://discord.com/oauth2/authorize"
DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token"
DISCORD_USER_API = "https://discord.com/api/users/@me"
FRONTEND_URL = os.getenv("FRONTEND_URL")


def discord_start():
    """Start OAuth without login linking (pure login flow if you want it)."""
    discord = OAuth2Session(
        DISCORD_CLIENT_ID,
        redirect_uri=DISCORD_CALLBACK_URL,
        scope=["identify"],
    )
    auth_url, _ = discord.authorization_url(DISCORD_AUTH_URL)
    return redirect(auth_url)


def discord_link():
    """
    Begin linking a Discord account to an existing user session.
    - Accepts ?session_id=... and optional ?redirect_to=...
    - Accepts ?state=... for back-compat but IGNORES it; generates own server state.
    """
    _client_state = request.args.get("state")  # accepted but intentionally ignored
    session_token = request.args.get("session_id")
    redirect_to = request.args.get("redirect_to", "/")

    if not session_token:
        return jsonify({"error": "Missing session token"}), 400

    db = get_db()
    session = db.execute(
        "SELECT user_id FROM sessions WHERE session_id = ?",
        (session_token,),
    ).fetchone()
    if not session:
        return jsonify({"error": "Invalid or expired session"}), 401

    user_id = session["user_id"]
    username_row = db.execute(
        "SELECT username FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()
    if username_row and username_row["username"] == "demo-user":
        return jsonify({"error": "Demo user cannot link Discord accounts."}), 403

    # Generate CSRF state on the server
    server_state = secrets.token_urlsafe(32)

    discord = OAuth2Session(
        DISCORD_CLIENT_ID,
        redirect_uri=DISCORD_CALLBACK_URL,
        scope=["identify"],
    )
    auth_url, _ = discord.authorization_url(DISCORD_AUTH_URL, state=server_state)

    # Store mapping on the active Flask app (dev-friendly). For prod, prefer DB/Redis.
    state_map = current_app.__dict__.setdefault("oauth_state_map", {})
    state_map[server_state] = {
        "user_id": user_id,
        "redirect_to": redirect_to,
    }

    return redirect(auth_url)


def discord_callback():
    """
    OAuth callback:
    - Validates server-generated state.
    - Exchanges code for token.
    - Links identity or creates a new user.
    - Creates an app session and redirects to frontend.
    """
    discord = OAuth2Session(
        DISCORD_CLIENT_ID,
        redirect_uri=DISCORD_CALLBACK_URL,
        scope=["identify"],
    )
    try:
        token = discord.fetch_token(
            DISCORD_TOKEN_URL,
            client_secret=DISCORD_CLIENT_SECRET,
            authorization_response=request.url,
            include_client_id=True,  # explicit for provider quirks
        )
    except Exception as e:
        return jsonify({"error": "OAuth token exchange failed", "details": str(e)}), 400

    resp = discord.get(DISCORD_USER_API)
    if not resp.ok:
        return jsonify({"error": "Failed to fetch user info from Discord"}), 400

    discord_info = resp.json()
    discord_id = str(discord_info.get("id"))
    # discriminator is deprecated in newer Discord accounts; keep for back-compat if present
    discriminator = discord_info.get("discriminator")
    base_name = discord_info.get("username") or "discord-user"
    if discriminator:
        display_name = f"{base_name}#{discriminator}"
    else:
        display_name = base_name

    db = get_db()

    # Check if this Discord account is already linked
    identity = db.execute(
        "SELECT user_id FROM auth_identities WHERE provider = ? AND provider_user_id = ?",
        ("discord", discord_id),
    ).fetchone()

    # Resolve stored link context via server-generated state
    linking_data = None
    state = request.args.get("state")
    state_map = current_app.__dict__.setdefault("oauth_state_map", {})
    if state:
        linking_data = state_map.pop(state, None)  # pop to prevent replay

    if identity:
        user_id = identity["user_id"]

    elif linking_data:
        user_id = linking_data["user_id"]
        db.execute(
            "INSERT INTO auth_identities (user_id, provider, provider_user_id, display_name) VALUES (?, ?, ?, ?)",
            (user_id, "discord", discord_id, display_name),
        )
        db.commit()

    else:
        # No prior identity and no link request → create a new user
        attempt = 0
        while True:
            candidate = base_name if attempt == 0 else f"{base_name}-{attempt}"
            taken = db.execute(
                "SELECT 1 FROM users WHERE username = ?",
                (candidate,),
            ).fetchone()
            if not taken:
                username_for_account = candidate
                break
            attempt += 1

        db.execute("INSERT INTO users (username) VALUES (?)", (username_for_account,))
        user_id = db.execute(
            "SELECT id FROM users WHERE username = ?",
            (username_for_account,),
        ).fetchone()["id"]
        db.execute(
            "INSERT INTO auth_identities (user_id, provider, provider_user_id, display_name) VALUES (?, ?, ?, ?)",
            (user_id, "discord", discord_id, display_name),
        )
        db.commit()

    # Create an application session
    session_id = str(uuid.uuid4())
    db.execute(
        "INSERT INTO sessions (session_id, user_id) VALUES (?, ?)",
        (session_id, user_id),
    )
    db.commit()

    # Redirect back to frontend (back-compat: token in URL)
    redirect_to = linking_data["redirect_to"] if linking_data and "redirect_to" in linking_data else "/"
    return redirect(f"{FRONTEND_URL}/discord-auth-success.html?token={session_id}&redirect_to={redirect_to}")


def discord_status():
    db = get_db()
    identity = db.execute(
        "SELECT display_name, provider_user_id FROM auth_identities WHERE provider = ? AND user_id = ?",
        ("discord", request.user_id),
    ).fetchone()

    if identity:
        return jsonify(
            {
                "discord_username": identity["display_name"],
                "provider_user_id": identity["provider_user_id"],
            }
        ), 200
    else:
        return jsonify({"error": "Discord not linked"}), 404


def discord_unlink():
    db = get_db()
    identity = db.execute(
        "SELECT id FROM auth_identities WHERE provider = ? AND user_id = ?",
        ("discord", request.user_id),
    ).fetchone()
    if not identity:
        return jsonify({"error": "No linked Discord account"}), 400

    # Ensure user has at least one other login method
    linked_count = db.execute(
        """
        SELECT 
            (SELECT COUNT(*) FROM auth_identities WHERE user_id = ?) +
            (SELECT CASE WHEN password IS NOT NULL THEN 1 ELSE 0 END FROM users WHERE id = ?) AS total_count
        """,
        (request.user_id, request.user_id),
    ).fetchone()['total_count']
    if linked_count <= 1:
        return jsonify({"error": "You cannot unlink Discord as it's your only login method!"}), 400

    db.execute(
        "DELETE FROM auth_identities WHERE provider = ? AND user_id = ?",
        ("discord", request.user_id),
    )
    db.commit()
    return jsonify({"success": True, "message": "Discord unlinked successfully."})
