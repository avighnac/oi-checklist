from flask import request, jsonify, redirect, current_app
from requests_oauthlib import OAuth2Session
import requests
import secrets
import uuid
import os
from database.db import get_db

# Google OAuth2
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_CALLBACK_URL = os.getenv("BACKEND_URL") + "/auth/google/callback"
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
GOOGLE_SCOPE = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]
FRONTEND_URL = os.getenv("FRONTEND_URL")


def _ensure_state_map():
    # store per-process (good for dev). For prod, prefer DB/Redis.
    return current_app.__dict__.setdefault("oauth_state_map", {})


def _unique_username_from_email_or_name(db, email: str = None, name: str = None):
    # Prefer email local-part if present; else a sanitized name; else fallback.
    import re as _re
    base = None
    if email and "@" in email:
        base = email.split("@", 1)[0]
    elif name:
        base = _re.sub(r"[^a-zA-Z0-9_-]+", "-", name.strip()).strip("-").lower()
    if not base:
        base = "google-user"

    attempt = 0
    while True:
        candidate = base if attempt == 0 else f"{base}-{attempt}"
        taken = db.execute("SELECT 1 FROM users WHERE username = ?", (candidate,)).fetchone()
        if not taken:
            return candidate
        attempt += 1


def google_start():
    """
    Begin Google login (no existing session). We generate our own CSRF state
    and remember that this is a 'login' flow with a default redirect target.
    """
    server_state = secrets.token_urlsafe(32)

    google = OAuth2Session(
        GOOGLE_CLIENT_ID,
        redirect_uri=GOOGLE_CALLBACK_URL,
        scope=GOOGLE_SCOPE,
    )
    auth_url, _ = google.authorization_url(
        GOOGLE_AUTH_URL,
        state=server_state,        # use our own state (not client-provided)
        access_type="offline",     # so refresh tokens can be issued (if needed later)
        prompt="consent",
    )

    state_map = _ensure_state_map()
    state_map[server_state] = {"flow": "login", "redirect_to": "/"}

    return redirect(auth_url)


def google_link():
    """
    Link Google to an already-logged-in local account.
    Accepts ?session_id=... and optional ?redirect_to=...
    Accepts ?state=... for back-compat but IGNORES it; we generate our own.
    """
    _client_state = request.args.get("state")  # accepted but intentionally ignored
    session_token = request.args.get("session_id")
    redirect_to = request.args.get("redirect_to", "/")

    if not session_token:
        return jsonify({"error": "Missing session token"}), 400

    db = get_db()
    session_row = db.execute(
        "SELECT user_id FROM sessions WHERE session_id = ?",
        (session_token,),
    ).fetchone()
    if not session_row:
        return jsonify({"error": "Invalid or expired session"}), 401
    user_id = session_row["user_id"]

    # Prevent linking for demo user
    username_row = db.execute(
        "SELECT username FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()
    if username_row and username_row["username"] == "demo-user":
        return jsonify({"error": "Demo user cannot link Google accounts."}), 403

    # Generate our own CSRF state
    server_state = secrets.token_urlsafe(32)

    google = OAuth2Session(
        GOOGLE_CLIENT_ID,
        redirect_uri=GOOGLE_CALLBACK_URL,
        scope=GOOGLE_SCOPE,
    )
    auth_url, _ = google.authorization_url(
        GOOGLE_AUTH_URL,
        state=server_state,
        access_type="offline",
        prompt="consent",
    )

    state_map = _ensure_state_map()
    state_map[server_state] = {
        "flow": "link",
        "user_id": user_id,
        "redirect_to": redirect_to,
    }

    return redirect(auth_url)


def google_callback():
    """
    Complete Google OAuth, handle both login and link flows:
    - Validates server-generated state.
    - Exchanges code for token.
    - Links identity or creates a new user.
    - Creates an app session and redirects to frontend.
    """
    google = OAuth2Session(
        GOOGLE_CLIENT_ID,
        redirect_uri=GOOGLE_CALLBACK_URL,
        scope=GOOGLE_SCOPE,
    )

    try:
        token = google.fetch_token(
            GOOGLE_TOKEN_URL,
            client_secret=GOOGLE_CLIENT_SECRET,
            authorization_response=request.url,
            include_client_id=True,   # explicit for provider quirks
        )
    except Exception as e:
        return jsonify({"error": "OAuth token exchange failed", "details": str(e)}), 400

    # Fetch OpenID Connect userinfo
    try:
        resp = requests.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {token['access_token']}"},
            timeout=10,
        )
        if not resp.ok:
            return jsonify({"error": "Failed to fetch user info from Google"}), 400
        ui = resp.json()
    except Exception as e:
        return jsonify({"error": "Google userinfo request failed", "details": str(e)}), 400

    provider = "google"
    google_sub = str(ui.get("sub"))  # stable Google user ID
    email = ui.get("email")
    email_verified = bool(ui.get("email_verified"))
    display_name = ui.get("name") or email or "Google User"

    if not google_sub:
        return jsonify({"error": "Missing sub in Google userinfo"}), 400

    # Resolve stored flow context via our server-generated state
    state = request.args.get("state")
    state_map = _ensure_state_map()
    linking_data = state_map.pop(state, None) if state else None  # pop to prevent replay

    db = get_db()

    # If this Google account is already linked, get its user
    identity = db.execute(
        "SELECT user_id FROM auth_identities WHERE provider = ? AND provider_user_id = ?",
        (provider, google_sub),
    ).fetchone()

    if identity:
        user_id = identity["user_id"]

    elif linking_data and linking_data.get("flow") == "link":
        # Linking to an existing account
        user_id = linking_data["user_id"]
        db.execute(
            "INSERT INTO auth_identities (user_id, provider, provider_user_id, display_name) VALUES (?, ?, ?, ?)",
            (user_id, provider, google_sub, display_name),
        )
        db.commit()

    else:
        # New login (create user)
        base_username = _unique_username_from_email_or_name(db, email=email, name=display_name)
        db.execute("INSERT INTO users (username) VALUES (?)", (base_username,))
        user_id = db.execute(
            "SELECT id FROM users WHERE username = ?",
            (base_username,),
        ).fetchone()["id"]
        db.execute(
            "INSERT INTO auth_identities (user_id, provider, provider_user_id, display_name) VALUES (?, ?, ?, ?)",
            (user_id, provider, google_sub, display_name),
        )
        db.commit()

    # Create a new app session for the browser
    session_id = str(uuid.uuid4())
    db.execute("INSERT INTO sessions (session_id, user_id) VALUES (?, ?)", (session_id, user_id))
    db.commit()

    # Redirect back to frontend (back-compat: token in URL)
    redirect_to = "/"
    if linking_data and "redirect_to" in linking_data:
        redirect_to = linking_data["redirect_to"]

    return redirect(f"{FRONTEND_URL}/google-auth-success.html?token={session_id}&redirect_to={redirect_to}")


def google_status():
    db = get_db()
    identity = db.execute(
        "SELECT display_name FROM auth_identities WHERE provider = ? AND user_id = ?",
        ("google", request.user_id),
    ).fetchone()
    if identity:
        return jsonify({"google_display_name": identity["display_name"]}), 200
    else:
        return jsonify({"error": "Google not linked"}), 404


def google_unlink():
    db = get_db()
    identity = db.execute(
        "SELECT id FROM auth_identities WHERE provider = ? AND user_id = ?",
        ("google", request.user_id),
    ).fetchone()
    if not identity:
        return jsonify({"error": "No linked Google account"}), 400

    # Prevent lockout: ensure there's at least one other login method
    linked_count = db.execute(
        """
        SELECT 
            (SELECT COUNT(*) FROM auth_identities WHERE user_id = ?) +
            (SELECT CASE WHEN password IS NOT NULL THEN 1 ELSE 0 END FROM users WHERE id = ?) AS total_count
        """,
        (request.user_id, request.user_id),
    ).fetchone()['total_count']
    if linked_count <= 1:
        return jsonify({"error": "You cannot unlink Google as it's your only login method!"}), 400

    db.execute(
        "DELETE FROM auth_identities WHERE provider = ? AND user_id = ?",
        ("google", request.user_id),
    )
    db.commit()
    return jsonify({"success": True, "message": "Google unlinked successfully."})
