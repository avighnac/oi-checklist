from flask import request, jsonify, redirect, current_app
from requests_oauthlib import OAuth2Session
import secrets
import uuid
import os
from database.db import get_db

GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET")
GITHUB_CALLBACK_URL = os.getenv("BACKEND_URL") + "/auth/github/callback"
GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize'
GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token'
GITHUB_USER_API = 'https://api.github.com/user'
FRONTEND_URL = os.getenv("FRONTEND_URL")

def github_start():
    github = OAuth2Session(GITHUB_CLIENT_ID, redirect_uri=GITHUB_CALLBACK_URL)
    auth_url, _ = github.authorization_url(GITHUB_AUTH_URL)
    return redirect(auth_url)

def github_link():
    _client_state = request.args.get("state")  # accepted but intentionally ignored
    session_token = request.args.get("session_id")
    redirect_to = request.args.get("redirect_to", "/")  # default to home

    if not session_token:
        return jsonify({"error": "Missing session token"}), 400

    db = get_db()
    session = db.execute(
        "SELECT user_id FROM sessions WHERE session_id = ?",
        (session_token,)
    ).fetchone()
    if not session:
        return jsonify({"error": "Invalid or expired session"}), 401

    user_id = session["user_id"]
    username_row = db.execute(
        "SELECT username FROM users WHERE id = ?",
        (user_id,)
    ).fetchone()
    if username_row and username_row["username"] == "demo-user":
        return jsonify({"error": "Demo user cannot link GitHub accounts."}), 403

    # Generate our own CSRF state (ignore any client-provided one)
    server_state = secrets.token_urlsafe(32)

    github = OAuth2Session(GITHUB_CLIENT_ID, redirect_uri=GITHUB_CALLBACK_URL)
    auth_url, _ = github.authorization_url(GITHUB_AUTH_URL, state=server_state)

    # Store mapping on the active Flask app (dev-friendly). For prod, use DB/Redis.
    state_map = current_app.__dict__.setdefault("oauth_state_map", {})
    state_map[server_state] = {
        "user_id": user_id,
        "redirect_to": redirect_to,
    }

    return redirect(auth_url)

def github_callback():
    github = OAuth2Session(GITHUB_CLIENT_ID, redirect_uri=GITHUB_CALLBACK_URL)
    try:
        token = github.fetch_token(
            GITHUB_TOKEN_URL,
            client_secret=GITHUB_CLIENT_SECRET,
            authorization_response=request.url,
            include_client_id=True,   # explicit, avoids some provider quirks
        )
    except Exception as e:
        return jsonify({"error": "OAuth token exchange failed", "details": str(e)}), 400

    # Fetch GitHub user info
    resp = github.get(GITHUB_USER_API)
    if not resp.ok:
        return jsonify({"error": "Failed to fetch user info from GitHub"}), 400

    github_info = resp.json()
    github_id = str(github_info.get("id"))
    github_username = github_info.get("login")

    db = get_db()

    # Did we already link this GitHub account to any user?
    identity = db.execute(
        "SELECT user_id FROM auth_identities WHERE provider = ? AND provider_user_id = ?",
        ("github", github_id)
    ).fetchone()

    # Resolve 'state' we generated in the link step (back-compat: we still read ?state)
    linking_data = None
    state = request.args.get("state")
    state_map = current_app.__dict__.setdefault("oauth_state_map", {})
    if state:
        linking_data = state_map.pop(state, None)  # pop() to prevent replay

    if identity:
        # Existing GitHub account → log in as that user
        user_id = identity["user_id"]

    elif linking_data:
        # We initiated a link for a specific user → attach identity
        user_id = linking_data["user_id"]
        db.execute(
            "INSERT INTO auth_identities (user_id, provider, provider_user_id, display_name) VALUES (?, ?, ?, ?)",
            (user_id, "github", github_id, github_username)
        )
        db.commit()

    else:
        # No prior identity and no pending link → create a new user
        base_username = github_username or "github-user"
        attempt = 0
        while True:
            candidate = f"{base_username}" if attempt == 0 else f"{base_username}-{attempt}"
            taken = db.execute("SELECT 1 FROM users WHERE username = ?", (candidate,)).fetchone()
            if not taken:
                github_username = candidate
                break
            attempt += 1

        db.execute("INSERT INTO users (username) VALUES (?)", (github_username,))
        user_id = db.execute("SELECT id FROM users WHERE username = ?", (github_username,)).fetchone()["id"]
        db.execute(
            "INSERT INTO auth_identities (user_id, provider, provider_user_id, display_name) VALUES (?, ?, ?, ?)",
            (user_id, "github", github_id, github_username)
        )
        db.commit()

    # Create a fresh app session for the browser
    session_id = str(uuid.uuid4())
    db.execute("INSERT INTO sessions (session_id, user_id) VALUES (?, ?)", (session_id, user_id))
    db.commit()

    # Redirect back to frontend (back-compat: token in URL; you can change later)
    redirect_to = linking_data["redirect_to"] if linking_data and "redirect_to" in linking_data else "/"
    return redirect(f"{FRONTEND_URL}/github-auth-success.html?token={session_id}&redirect_to={redirect_to}")


def github_status():
    db = get_db()
    identity = db.execute(
        "SELECT display_name FROM auth_identities WHERE provider = ? AND user_id = ?",
        ("github", request.user_id)
    ).fetchone()

    if identity:
        return jsonify({"github_username": identity["display_name"]}), 200
    else:
        return jsonify({"error": "GitHub not linked"}), 404


def github_unlink():
    db = get_db()

    # Ensure there *is* a GitHub identity to remove
    identity = db.execute(
        "SELECT id FROM auth_identities WHERE provider = ? AND user_id = ?",
        ("github", request.user_id)
    ).fetchone()
    if not identity:
        return jsonify({"error": "No linked GitHub account"}), 400

    # Prevent lockout: require at least one other login method
    linked_count = db.execute(
        """
        SELECT 
            (SELECT COUNT(*) FROM auth_identities WHERE user_id = ?) +
            (SELECT CASE WHEN password IS NOT NULL THEN 1 ELSE 0 END FROM users WHERE id = ?) AS total_count
        """,
        (request.user_id, request.user_id)
    ).fetchone()['total_count']

    if linked_count <= 1:
        return jsonify({"error": "You cannot unlink GitHub as it's your only login method!"}), 400

    db.execute(
        "DELETE FROM auth_identities WHERE provider = ? AND user_id = ?",
        ("github", request.user_id)
    )
    db.commit()

    return jsonify({"success": True, "message": "GitHub unlinked successfully."})
