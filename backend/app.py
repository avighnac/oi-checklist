import re
import time
import random
import requests
from concurrent.futures import ThreadPoolExecutor
from flask import Flask, request, jsonify, redirect
import sqlite3
import hashlib
import os
from dotenv import load_dotenv
from flask_cors import CORS
from datetime import timedelta, datetime
import pytz
from functools import wraps
import json
import uuid
from requests_oauthlib import OAuth2Session

# our functions
from database.db import get_db
from scrape.ojuz import verify_ojuz, update_ojuz_scores
from scrape.qoj import verify_qoj, update_qoj_scores
from auth.session import session_required
from auth.github import *
from auth.discord import *
from auth.google import *
from auth.auth import *
from notes.notes import get_note, save_note
from virtual_contests.vc import *

# this is probably really bad but the website doesn't work without it
os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'

load_dotenv()

def create_app():
    app = Flask(__name__)
    app.config['SESSION_COOKIE_SAMESITE'] = 'None' if os.getenv("FLASK_ENV") == "production" else 'Lax'
    app.config['SESSION_COOKIE_SECURE'] = os.getenv("FLASK_ENV") == "production"
    CORS(app, supports_credentials=True, origins=[os.getenv("FRONTEND_URL")])
    return app

app = create_app()

# Notes api
app.add_url_rule("/api/note", view_func=session_required(get_note), methods=["GET"])
app.add_url_rule("/api/note", view_func=session_required(save_note), methods=["POST"])

# Auth
## GitHub oauth
app.add_url_rule("/auth/github/start", view_func=github_start, methods=["GET"])
app.add_url_rule("/auth/github/link", view_func=github_link, methods=["GET"])
app.add_url_rule("/auth/github/callback", view_func=github_callback, methods=["GET"])
app.add_url_rule("/api/github/status", view_func=session_required(github_status), methods=["GET"])
app.add_url_rule("/api/github/unlink", view_func=session_required(github_unlink), methods=["POST"])

## Discord oauth
app.add_url_rule("/auth/discord/start", view_func=discord_start)
app.add_url_rule("/auth/discord/link", view_func=discord_link)
app.add_url_rule("/auth/discord/callback", view_func=discord_callback)
app.add_url_rule("/api/discord/status", view_func=session_required(discord_status))
app.add_url_rule("/api/discord/unlink", view_func=session_required(discord_unlink), methods=["POST"])

## Google oauth
app.add_url_rule("/auth/google/start", view_func=google_start)
app.add_url_rule("/auth/google/link", view_func=google_link)
app.add_url_rule("/auth/google/callback", view_func=google_callback)
app.add_url_rule("/api/google/status", view_func=session_required(google_status))
app.add_url_rule("/api/google/unlink", view_func=session_required(google_unlink), methods=["POST"])

## regular auth
app.add_url_rule("/api/register", view_func=api_register, methods=["POST"])
app.add_url_rule("/api/login", view_func=api_login, methods=["POST"])
app.add_url_rule("/api/whoami", view_func=session_required(whoami), methods=["GET"])
app.add_url_rule("/api/logout", view_func=session_required(api_logout), methods=["POST"])

# platform sync stuff (out of contest)
app.add_url_rule("/api/verify-ojuz", view_func=session_required(verify_ojuz), methods=["POST"])
app.add_url_rule("/api/update-ojuz", view_func=session_required(update_ojuz_scores), methods=["POST"])
app.add_url_rule("/api/verify-qoj", view_func=session_required(verify_qoj), methods=["POST"])
app.add_url_rule("/api/update-qoj", view_func=session_required(update_qoj_scores), methods=["POST"])

# virtual contest stuff
app.add_url_rule("/api/virtual-contests", view_func=session_required(get_virtual_contests), methods=["GET"])
app.add_url_rule("/api/virtual-contests/history", view_func=session_required(get_virtual_contest_history), methods=["GET"])
app.add_url_rule("/api/virtual-contests/start", view_func=session_required(start_virtual_contest), methods=["POST"])
app.add_url_rule("/api/virtual-contests/end", view_func=session_required(end_virtual_contest), methods=["POST"])
app.add_url_rule("/api/virtual-contests/confirm", view_func=session_required(confirm_virtual_contest), methods=["POST"])
app.add_url_rule("/api/virtual-contests/submit", view_func=session_required(submit_virtual_contest), methods=["POST"])
app.add_url_rule("/api/contest-scores", view_func=session_required(get_contest_scores), methods=["GET"])
app.add_url_rule("/api/virtual-contests/detail/<slug>", view_func=session_required(get_virtual_contest_detail), methods=["GET"])

@app.route('/api/settings', methods=["GET"])
@session_required
def get_user_settings():
    user_id = request.user_id
    db = get_db()

    row = db.execute(
        'SELECT checklist_public FROM user_settings WHERE user_id = ?',
        (user_id,)
    ).fetchone()

    # If no row yet, assume default (private)
    checklist_public = bool(row['checklist_public']) if row else False

    return jsonify({
        "checklist_public": checklist_public
    })

@app.route('/api/settings', methods=["POST"])
@session_required
def update_user_settings():
    user_id = request.user_id
    db = get_db()

    data = request.get_json()
    if 'checklist_public' not in data:
        return jsonify({"error": "Missing 'checklist_public' in request body"}), 400

    checklist_public = int(bool(data['checklist_public']))  # sanitize to 0/1

    db.execute('''
        INSERT INTO user_settings (user_id, checklist_public)
        VALUES (?, ?)
        ON CONFLICT(user_id) DO UPDATE SET checklist_public = excluded.checklist_public
    ''', (user_id, checklist_public))
    db.commit()

    return jsonify({"success": True})

import ast

def choose_link(links, platform_pref=None):
    """links is a list of {platform, url} dicts."""
    if not links:
        return None

    # Normalize platform_pref to a list
    if platform_pref:
        if isinstance(platform_pref, str):
            try:
                # Try to interpret it as a list-like string
                parsed = ast.literal_eval(platform_pref)
                if isinstance(parsed, list):
                    platform_pref = parsed
                else:
                    platform_pref = [platform_pref]
            except (ValueError, SyntaxError):
                platform_pref = [platform_pref]

        for plat in platform_pref:
            for l in links:
                if l['platform'] == plat:
                    return l['url']

    # Default order preference
    order = ["oj.uz", "qoj.ac"]
    for plat in order:
        for l in links:
            if l['platform'] == plat:
                return l['url']

    return links[0]['url']

@app.route('/api/problems', methods=["GET"])
@session_required
def get_problems():
    from_names = request.args.get('names')
    if not from_names:
        return jsonify({"error": "Missing 'names' query parameter"}), 400

    from_names = [name.strip() for name in from_names.split(',')]
    user_id = request.user_id 
    db = get_db()

    pref_row = db.execute(
        "SELECT platform_pref FROM user_settings WHERE user_id = ?",
        (user_id,)
    ).fetchone()
    platform_pref = pref_row['platform_pref'] if pref_row and pref_row['platform_pref'] else None

    want_all_links = request.headers.get("X-All-Problem-Links", "").lower() == "true"

    placeholders = ', '.join(['?'] * len(from_names))
    problems_raw = db.execute(
        f'SELECT *, COALESCE(number, 0) as sort_number FROM problems WHERE source IN ({placeholders}) ORDER BY source, year, sort_number',
        tuple(from_names)
    ).fetchall()

    problem_ids = [row['id'] for row in problems_raw]
    links_by_pid = {}
    if problem_ids:
        ph_ids = ', '.join(['?'] * len(problem_ids))
        link_rows = db.execute(
            f'SELECT problem_id, platform, url FROM problem_links WHERE problem_id IN ({ph_ids})',
            tuple(problem_ids)
        ).fetchall()
        for lr in link_rows:
            links_by_pid.setdefault(lr['problem_id'], []).append({
                'platform': lr['platform'],
                'url': lr['url']
            })

    progress_rows = db.execute(
        f'SELECT problem_name, source, year, status, score FROM problem_statuses WHERE user_id = ? AND source IN ({placeholders})',
        (user_id, *from_names)
    ).fetchall()

    progress = {
        (row['problem_name'], row['source'], row['year']): {
            'status': row['status'],
            'score': row['score']
        }
        for row in progress_rows
    }

    problems_by_category = {}

    for row in problems_raw:
        source = row['source']
        year = row['year']
        pid = row['id']

        problem = dict(row)
        problem.pop("id", None)

        links = links_by_pid.get(pid, [])
        if want_all_links:
            problem['links'] = {l['platform']: l['url'] for l in links}
        else:
            problem['link'] = choose_link(links, platform_pref)

        if 'extra' in row.keys() and row['extra'] is not None:
            problem['extra'] = row['extra']

        key = (problem['name'], problem['source'], problem['year'])
        if key in progress:
            problem['status'] = progress[key]['status']
            problem['score'] = progress[key]['score']
        else:
            problem['status'] = 0
            problem['score'] = 0

        if source not in problems_by_category:
            problems_by_category[source] = {}
        problems_by_category[source].setdefault(year, []).append(problem)

    return jsonify(problems_by_category)

@app.route('/api/user', methods=["GET"])
def get_user():
    username = request.args.get('username')
    if not username:
        return jsonify({"error": "Missing 'username' query parameter"}), 400

    problems = request.args.get('problems', '')
    problems_list = [p.strip() for p in problems.split(',')] if problems else []

    db = get_db()

    user = db.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if not user:
        return jsonify({"error": f"User {username} not found"}), 404

    user_id = user['id']

    checklist_public_row = db.execute("SELECT checklist_public FROM user_settings WHERE user_id = ?", (user_id,)).fetchone()
    checklist_public = checklist_public_row['checklist_public'] if checklist_public_row else 0

    if checklist_public == 0:
        return jsonify({"error": f"{username}'s checklist is private."}), 403

    # ---- get their platform setting ----
    pref_row = db.execute(
        "SELECT platform_pref FROM user_settings WHERE user_id = ?",
        (user_id,)
    ).fetchone()
    platform_pref = pref_row['platform_pref'] if pref_row and pref_row['platform_pref'] else None

    problems_by_category = {}
    if problems_list:
        placeholders = ', '.join(['?'] * len(problems_list))

        problems_raw = db.execute(
            f'SELECT *, COALESCE(number, 0) as sort_number FROM problems WHERE source IN ({placeholders}) ORDER BY source, year, sort_number',
            tuple(problems_list)
        ).fetchall()

        problem_ids = [row['id'] for row in problems_raw]
        links_by_pid = {}
        if problem_ids:
            ph_ids = ', '.join(['?'] * len(problem_ids))
            link_rows = db.execute(
                f'SELECT problem_id, platform, url FROM problem_links WHERE problem_id IN ({ph_ids})',
                tuple(problem_ids)
            ).fetchall()
            for lr in link_rows:
                links_by_pid.setdefault(lr['problem_id'], []).append({
                    'platform': lr['platform'],
                    'url': lr['url']
                })

        progress_rows = db.execute(
            f'''
            SELECT problem_name, source, year, status, score
            FROM problem_statuses
            WHERE user_id = ? AND source IN ({placeholders})
            ''',
            (user_id, *problems_list)
        ).fetchall()

        progress = {
            (row['problem_name'], row['source'], row['year']): {
                'status': row['status'],
                'score': row['score']
            }
            for row in progress_rows
        }

        for row in problems_raw:
            source = row['source']
            year = row['year']
            pid = row['id']

            problem = dict(row)
            problem.pop("id", None)

            # ---- attach chosen link ----
            links = links_by_pid.get(pid, [])
            problem['link'] = choose_link(links, platform_pref)

            key = (problem['name'], problem['source'], problem['year'])
            if key in progress:
                problem['status'] = progress[key]['status']
                problem['score'] = progress[key]['score']
            else:
                problem['status'] = 0
                problem['score'] = 0

            if source not in problems_by_category:
                problems_by_category[source] = {}
            problems_by_category[source].setdefault(year, []).append(problem)

    return jsonify({
        "username": username,
        "checklist_public": checklist_public,
        "problems": problems_by_category
    })

@app.route('/api/update-problem-status', methods=['POST'])
@session_required
def update_problem_status():
    data = request.get_json()
    user_id = request.user_id

    problem_name = data.get('problem_name')
    source = data.get('source')
    year = data.get('year')
    status = data.get('status')

    if not all([problem_name, source, year, status is not None]):
        return jsonify({"error": "Missing required fields"}), 400

    db = get_db()
    db.execute(
        '''
        INSERT INTO problem_statuses (user_id, problem_name, source, year, status)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, problem_name, source, year)
        DO UPDATE SET status = ?
        ''',
        (user_id, problem_name, source, year, status, status)
    )
    db.commit()
    db.close()
    return jsonify(success=True)

@app.route('/api/update-problem-score', methods=['POST'])
@session_required
def update_problem_score():
    data = request.get_json()
    user_id = request.user_id  

    problem_name = data.get('problem_name')
    source = data.get('source')
    year = data.get('year')
    score = data.get('score')

    if not all([problem_name, source, year, score is not None]):
        return jsonify({"error": "Missing required fields"}), 400

    db = get_db()
    db.execute(
        '''
        INSERT INTO problem_statuses (user_id, problem_name, source, year, score)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, problem_name, source, year)
        DO UPDATE SET score = ?
        ''',
        (user_id, problem_name, source, year, score, score)
    )
    db.commit()
    db.close()
    return jsonify(success=True)

# --- POST /api/user-settings: make platform_pref optional like others ---
@app.route('/api/user-settings', methods=['POST'])
@session_required
def upd_user_settings():
    # Parse once, safely
    data = request.get_json(silent=True) or {}
    user_id = request.user_id

    # Presence flags (so we only update provided keys)
    has_olymp = 'olympiad_order' in data
    has_hidden = 'hidden' in data
    has_asc    = 'asc_sort' in data
    has_pref   = 'platform_pref' in data

    olympiad_order = data.get('olympiad_order')
    hidden         = data.get('hidden')
    asc_sort       = data.get('asc_sort')
    platform_pref  = data.get('platform_pref')

    # ---- Validation ----
    if has_olymp and not isinstance(olympiad_order, list):
        return jsonify({"error": "Invalid 'olympiad_order' (must be list)"}), 400

    if has_hidden and hidden is not None and not isinstance(hidden, list):
        return jsonify({"error": "Invalid 'hidden' (must be list)"}), 400

    if has_asc and not isinstance(asc_sort, (bool, int)):
        return jsonify({"error": "Invalid 'asc_sort' (must be bool)"}), 400

    if has_pref:
        if not (isinstance(platform_pref, list) and all(isinstance(x, str) for x in platform_pref)):
            return jsonify({"error": "Invalid 'platform_pref' (must be list of strings)"}), 400
        
    has_puser = 'platform_usernames' in data
    platform_usernames = data.get('platform_usernames')
    if has_puser:
        if isinstance(platform_usernames, str):
            try:
                parsed = json.loads(platform_usernames)
            except Exception:
                return jsonify({"error": "Invalid 'platform_usernames' (must be JSON string of object)"}), 400
        else:
            parsed = platform_usernames
        if not isinstance(parsed, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in parsed.items()):
            return jsonify({"error": "Invalid 'platform_usernames' (must be object mapping platform->username strings)"}), 400
        platform_usernames = json.dumps(parsed)

    db = get_db()

    # 1) Ensure row exists so defaults apply
    db.execute(
        "INSERT INTO user_settings (user_id) VALUES (?) ON CONFLICT(user_id) DO NOTHING",
        (user_id,)
    )

    # 2) Update only provided fields (PATCH semantics)
    db.execute(
        """
        UPDATE user_settings
        SET
          olympiad_order     = COALESCE(?, olympiad_order),
          hidden             = COALESCE(?, hidden),
          asc_sort           = COALESCE(?, asc_sort),
          platform_pref      = COALESCE(?, platform_pref),
          platform_usernames = COALESCE(?, platform_usernames)
        WHERE user_id = ?
        """,
        (
            # If key provided: store JSON text (lists) or int for boolean
            json.dumps(olympiad_order) if has_olymp else None,
            json.dumps(hidden)         if has_hidden else None,
            (1 if asc_sort else 0)     if has_asc    else None,
            json.dumps(platform_pref)  if has_pref   else None,
            platform_usernames         if has_puser  else None,
            user_id,
        )
    )

    db.commit()
    return jsonify(success=True)

# --- GET /api/user-settings: include platform_pref and asc_sort ---
@app.route('/api/user-settings', methods=['GET'])
def gget_user_settings():
    username = request.args.get('username')
    if not username:
        return jsonify({"error": "Missing 'username' query parameter"}), 400
    db = get_db()
    user = db.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if not user:
        db.close()
        return jsonify({"error": f"User '{username}' not found"}), 404

    user_id = user['id']
    row = db.execute(
        "SELECT olympiad_order, hidden, asc_sort, platform_pref, platform_usernames FROM user_settings WHERE user_id = ?",
        (user_id,)
    ).fetchone()
    db.close()

    olympiad_order = hidden = platform_pref = None
    platform_usernames = None
    asc_sort = None

    if row:
        def parse_json(text):
            if text in (None, ""):
                return None
            try:
                return json.loads(text)
            except Exception:
                return None
        olympiad_order     = parse_json(row['olympiad_order'])
        hidden             = parse_json(row['hidden'])
        platform_pref      = parse_json(row['platform_pref'])
        platform_usernames = parse_json(row['platform_usernames'])
        v = row['asc_sort']
        if v is not None:
            if isinstance(v, (int, float)):
                asc_sort = bool(v)
            elif isinstance(v, str):
                asc_sort = v.strip().lower() in ("1", "true", "t", "yes", "y")

    return jsonify(
        olympiad_order=olympiad_order,
        hidden=hidden,
        asc_sort=asc_sort,
        platform_pref=platform_pref,
        platform_usernames=platform_usernames
    )

@app.route('/api/demo-login', methods=["POST"])
def api_demo_login():
    """
    Demo login endpoint that provides a fixed session for the demo account.
    This avoids creating infinite temporary sessions.
    """
    db = get_db()
    
    # Fixed demo account details
    demo_username = "demo-user"
    demo_session_id = "demo-session-fixed-token-123456789"
    
    # Ensure demo user exists
    demo_user = db.execute("SELECT id FROM users WHERE username = ?", (demo_username,)).fetchone()
    if not demo_user:
        # Create demo user if it doesn't exist
        db.execute("INSERT INTO users (username) VALUES (?)", (demo_username,))
        demo_user_id = db.execute("SELECT id FROM users WHERE username = ?", (demo_username,)).fetchone()["id"]
    else:
        demo_user_id = demo_user["id"]
    
    # Ensure demo session exists (or update if user_id changed)
    existing_session = db.execute("SELECT user_id FROM sessions WHERE session_id = ?", (demo_session_id,)).fetchone()
    if not existing_session:
        # Create fixed demo session
        db.execute("INSERT INTO sessions (session_id, user_id) VALUES (?, ?)", (demo_session_id, demo_user_id))
    elif existing_session["user_id"] != demo_user_id:
        # Update session to point to correct demo user
        db.execute("UPDATE sessions SET user_id = ? WHERE session_id = ?", (demo_user_id, demo_session_id))
    
    db.commit()
    
    return jsonify({
        "success": True, 
        "token": demo_session_id,
        "username": demo_username
    })

@app.route('/api/settings/sync', methods=["POST"])
@session_required
def sync_settings_to_account():
    data = request.get_json(silent=True) or {}
    local_storage_data = data.get("local_storage")
    db = get_db()
    # Store localStorage in user_settings
    if local_storage_data is not None:
        db.execute(
            "UPDATE user_settings SET local_storage = ? WHERE user_id = ?",
            (local_storage_data, request.user_id)
        )
        db.commit()
        return jsonify({"success": True, "message": "Settings synced successfully."})
    return jsonify({"success": False, "message": "No settings data provided."}), 400

if __name__ == "__main__":
    app.run(debug=False, host='0.0.0.0', port=os.getenv("PORT"))
