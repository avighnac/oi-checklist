from flask import request, jsonify
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor
from bs4 import BeautifulSoup
import cloudscraper
import re
import time
import json
import os
import hashlib
from database.db import get_db

BASE = "https://qoj.ac"

def _iso_to_dt(iso_str: str) -> datetime:
    # "2025-08-25T17:22:12Z" -> aware UTC datetime
    return datetime.fromisoformat(iso_str.replace('Z', '+00:00')).astimezone(timezone.utc)

def _dt_to_iso_utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')

def _make_scraper(qoj_session_id: str | None = None):
    s = cloudscraper.create_scraper()
    if qoj_session_id:
        # QOJ is UOJ-based; the cookie name is UOJSESSID
        s.cookies.set("UOJSESSID", qoj_session_id, domain="qoj.ac")
    # keep a UA for good measure
    s.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    })
    return s

def _is_logged_in(soup: BeautifulSoup) -> bool:
    """
    Determine if the current page reflects a logged-in session.
    Heuristic:
      - If a 'Login' nav link exists, session is invalid.
      - If a username badge exists as a `span.uoj-username`, session is valid.
      - Otherwise, if a logout link exists, session is valid.
    """
    # Explicit login link means not logged in
    if soup.select_one('a.nav-link[href="//qoj.ac/login"]'):
        return False
    # QOJ shows username as <span class="uoj-username" ...>name</span>
    if soup.select_one('span.uoj-username'):
        return True
    # Fallback: presence of a logout link also implies logged in
    if soup.select_one('a.nav-link[href^="//qoj.ac/logout"]'):
        return True
    return False

def _get_db_token(db) -> str | None:
    row = db.execute(
        "SELECT token FROM scraper_auth_tokens WHERE platform = ? ORDER BY rowid DESC LIMIT 1",
        ("qoj.ac",),
    ).fetchone()
    return row["token"] if row else None

def _save_db_token(db, token: str) -> None:
    # replace any existing token row(s) for qoj.ac with the new one
    db.execute("DELETE FROM scraper_auth_tokens WHERE platform = ?", ("qoj.ac",))
    db.execute(
        "INSERT INTO scraper_auth_tokens (platform, token) VALUES (?, ?)",
        ("qoj.ac", token),
    )
    db.commit()

def _get_login_token(scraper) -> str:
    r = scraper.get(f"{BASE}/login", timeout=20)
    r.raise_for_status()
    m = re.search(r'_token\s*:\s*"([^"]+)"', r.text)
    if not m:
        raise RuntimeError("CSRF token (_token) not found on login page")
    return m.group(1)

def _perform_login(scraper, username: str, password: str) -> None:
    token = _get_login_token(scraper)
    hashed_password = hashlib.md5(password.encode("utf-8")).hexdigest()
    payload = {
        "_token": token,
        "login": "",
        "username": username,
        "password": hashed_password,
    }
    resp = scraper.post(f"{BASE}/login", data=payload, timeout=20)
    resp.raise_for_status()
    if resp.text.strip() != "ok":
        raise RuntimeError(f"Login failed, server responded: {resp.text!r}")

def _refresh_qoj_token(db) -> str:
    """
    Log into qoj.ac using env vars QOJ_USER / QOJ_PASS and persist a fresh UOJSESSID.
    Returns the cookie value.
    """
    username = os.environ.get("QOJ_USER")
    password = os.environ.get("QOJ_PASS")
    if not username or not password:
        raise RuntimeError("QOJ_USER and QOJ_PASS env vars must be set to refresh session token")
    scraper = cloudscraper.create_scraper()
    scraper.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    })
    _perform_login(scraper, username, password)
    # extract the UOJSESSID cookie issued for qoj.ac
    new_token = None
    for cookie in scraper.cookies:
        if cookie.name == "UOJSESSID" and "qoj.ac" in cookie.domain:
            new_token = cookie.value
            break
    if not new_token:
        raise RuntimeError("Login succeeded but UOJSESSID cookie not found")
    _save_db_token(db, new_token)
    return new_token

def _ensure_auth_and_get_max_page(db, username: str):
    """
    Use the stored token (if any) to probe an extreme submissions page.
    If not logged in, refresh token via login, save it, and retry once.
    Returns (scraper, max_page).
    """
    token = _get_db_token(db)
    scraper = _make_scraper(token)

    def _probe(scr):
        url = f"{BASE}/submissions?submitter={username}&page=10000000"
        r = scr.get(url, timeout=20)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
        return soup

    soup = _probe(scraper)
    if not _is_logged_in(soup):
        print("[auth] Stored qoj.ac session is invalid; refreshing token via login…")
        token = _refresh_qoj_token(db)
        scraper = _make_scraper(token)
        soup = _probe(scraper)
        if not _is_logged_in(soup):
            raise RuntimeError("Authentication failed: still not logged in after refreshing token")

    # derive max page number from the pagination controls
    active = soup.select_one("li.page-item.active a.page-link")
    if active:
        try:
            max_page = int(active.get_text(strip=True))
        except ValueError:
            max_page = 1
    else:
        max_page = 1
        for a in soup.select("li.page-item a.page-link"):
            try:
                n = int(a.get_text(strip=True))
                if n > max_page:
                    max_page = n
            except ValueError:
                continue

    return scraper, max_page


# Helper to probe max page given an authenticated scraper and username
def _discover_max_page(scraper, username: str) -> int:
    """Probe a very large page index and read the paginator to find the real max page."""
    url = f"{BASE}/submissions?submitter={username}&page=10000000"
    r = scraper.get(url, timeout=20)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")

    active = soup.select_one("li.page-item.active a.page-link")
    if active:
        try:
            return int(active.get_text(strip=True))
        except ValueError:
            pass
    max_page = 1
    for a in soup.select("li.page-item a.page-link"):
        try:
            n = int(a.get_text(strip=True))
            if n > max_page:
                max_page = n
        except ValueError:
            continue
    return max_page

def _extract_problem_id_from_url(url: str) -> int | None:
    # Works for /problem/4206 or /contest/944/problem/4205
    m = re.search(r'/problem/(\d+)', url)
    return int(m.group(1)) if m else None

def _parse_server_time_offset(soup: BeautifulSoup) -> timedelta:
    """
    QOJ prints: <p>Server Time: YYYY-MM-DD HH:MM:SS </p>
    The timestamps in the table rows share that timezone.
    We convert those to UTC by comparing with our current UTC time.
    """
    p_tag = soup.find("p", string=re.compile(r"Server Time:\s*\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}"))
    if not p_tag:
        return timedelta(0)  # fallback if missing
    m = re.search(r"Server Time:\s*([0-9:\-\s]{19})", p_tag.get_text(" ", strip=True))
    if not m:
        return timedelta(0)
    server_naive = datetime.strptime(m.group(1), "%Y-%m-%d %H:%M:%S")
    # server_naive represents "local" server time; infer offset vs UTC now
    now_utc = datetime.utcnow()
    # offset = server_local - utc_now (i.e., how far ahead of UTC the server clock is)
    return server_naive - now_utc

def _parse_submissions_rows_for_page(html: str, server_offset: timedelta):
    """
    Returns list of dicts:
    {
      'submission_id': '1260177',
      'problem_id': 13167,
      'submission_time_iso': '...Z'
    }
    """
    soup = BeautifulSoup(html, "html.parser")
    rows = soup.select("table tbody tr")
    results = []
    for row in rows:
        try:
            a_sub = row.select_one("td a[href^='/submission/']")
            if not a_sub:
                continue
            sub_id = a_sub["href"].rsplit("/", 1)[-1]

            # problem link (handles /problem/<id> or /contest/.../problem/<id>)
            a_prob = row.select_one("td a[href*='/problem/']")
            if not a_prob:
                continue
            prob_href = a_prob["href"]
            pid = _extract_problem_id_from_url(prob_href)
            if pid is None:
                continue

            # submission time appears in two <small> tags: the first is Submit time, the second is Judge time.
            # Prefer the first (Submit time).
            smalls = row.find_all("small")
            if not smalls:
                continue
            tstr = smalls[0].get_text(strip=True)
            # parse as server-local naive -> convert to UTC using inferred offset
            local_naive = datetime.strptime(tstr, "%Y-%m-%d %H:%M:%S")
            # If server is ahead of UTC by +X, UTC = local - X
            dt_utc = (local_naive - server_offset).replace(tzinfo=timezone.utc)
            results.append({
                "submission_id": sub_id,
                "problem_id": pid,
                "submission_time_iso": _dt_to_iso_utc(dt_utc),
            })
        except Exception:
            continue
    return results, soup  # return soup so caller can reuse if needed

def _fetch_submission_details(scraper, sub_id: str):
    """
    Returns:
      {
        'submission_id': sub_id,
        'problem_id': <int> or None,
        'subtask_scores': [numbers],
        'total_score': float,
      }
    """
    url = f"{BASE}/submission/{sub_id}"
    r = scraper.get(url, timeout=20)
    if r.status_code != 200:
        return None
    soup = BeautifulSoup(r.text, "html.parser")

    # Recover problem id from any /problem/<id> link on the page (robust)
    pid = None
    a_prob = soup.select_one("a[href*='/problem/']")
    if a_prob:
        pid = _extract_problem_id_from_url(a_prob["href"])

    # Extract subtask scores
    subtask_scores = []
    total_score = 0.0

    # Strategy A: parse subtask headers in the Details accordion (robust for UOJ/QOJ)
    for hdr in soup.select("div.card-header"):
        title_el = hdr.select_one("h3.card-title")
        if not title_el:
            continue
        title_txt = title_el.get_text(" ", strip=True)
        if not re.search(r'^\s*Subtask\b', title_txt, flags=re.I):
            continue

        header_text = hdr.get_text(" ", strip=True)
        m = re.search(r'(?i)score:\s*([0-9]+(?:\.[0-9]+)?)', header_text)
        if m:
            val = float(m.group(1))
            subtask_scores.append(int(val) if val.is_integer() else round(val, 2))
        else:
            # keep placeholder for this subtask if header present but score missing
            subtask_scores.append(0)

    if subtask_scores:
        total_val = sum(float(x) for x in subtask_scores)
        total_score = int(total_val) if float(total_val).is_integer() else round(total_val, 2)
    else:
        # Strategy B: fall back to overall score badge at the top, if any
        score_badge = soup.select_one("a.uoj-score[data-score]")
        if score_badge and score_badge.get("data-score"):
            try:
                sc = float(score_badge["data-score"])
                total_score = int(sc) if sc.is_integer() else round(sc, 2)
                # treat as single-subtask problem when no explicit subtasks are found
                subtask_scores = [total_score]
            except Exception:
                pass

    return {
        "submission_id": sub_id,
        "problem_id": pid,
        "subtask_scores": subtask_scores,
        "total_score": total_score,
    }

def sync_qoj_submissions(active_contest, qoj_username: str):
    """
    Mirrors sync_ojuz_submissions but for qoj.ac.

    Args:
        active_contest: dict with keys:
            user_id, contest_name, contest_stage, start_time (ISO Z), end_time (ISO Z)
        qoj_username: QOJ handle (e.g., 'avighna')

    Returns:
        submissions_summary: list of dicts per contest problem:
            {
              'problem_index': int,
              'problem_name': str,
              'problem_link': str,
              'score': number,
              'subtask_scores': [numbers],
              'submission_time': ISO Z or None,
            }
    """
    db = get_db()

    user_id = active_contest['user_id']
    contest_name = active_contest['contest_name']
    contest_stage = active_contest['contest_stage']
    contest_start_time = active_contest['start_time']
    contest_end_time = active_contest['end_time']

    start_dt = _iso_to_dt(contest_start_time)
    end_dt = _iso_to_dt(contest_end_time)

    # Pull contest problems that have a qoj.ac link
    if contest_stage is not None:
        contest_problems = db.execute('''
            SELECT 
                cp.problem_index,
                p.name as problem_name,
                pl.url as problem_link
            FROM contest_problems cp
            JOIN problems p ON cp.problem_source = p.source 
                            AND cp.problem_year = p.year 
                            AND cp.problem_number = p.number
            JOIN problem_links pl ON p.id = pl.problem_id
            WHERE cp.contest_name = ? AND cp.contest_stage = ?
              AND pl.platform = 'qoj.ac'
            ORDER BY cp.problem_index
        ''', (contest_name, contest_stage)).fetchall()
    else:
        contest_problems = db.execute('''
            SELECT 
                cp.problem_index,
                p.name as problem_name,
                pl.url as problem_link
            FROM contest_problems cp
            JOIN problems p ON cp.problem_source = p.source 
                            AND cp.problem_year = p.year 
                            AND cp.problem_number = p.number
            JOIN problem_links pl ON p.id = pl.problem_id
            WHERE cp.contest_name = ? AND cp.contest_stage IS NULL
              AND pl.platform = 'qoj.ac'
            ORDER BY cp.problem_index
        ''', (contest_name,)).fetchall()

    print(f"Found {len(contest_problems)} qoj.ac problems for contest {contest_name}, stage: {contest_stage}")
    for row in contest_problems:
        print(dict(row))

    if not contest_problems:
        return []

    # Map QOJ numeric problem_id -> contest problem info
    problem_id_map = {}
    for problem in contest_problems:
        pid = _extract_problem_id_from_url(problem['problem_link'])
        if pid is None:
            continue
        problem_id_map[pid] = {
            'index': problem['problem_index'],
            'name': problem['problem_name'],
            'link': problem['problem_link'],
        }

    if not problem_id_map:
        print("No valid QOJ problem ids extracted from links; aborting.")
        return []

    print(f"Starting qoj.ac sync for user {qoj_username}, contest {contest_name} {contest_stage}")
    print(f"Contest time range: {contest_start_time} to {contest_end_time}")

    # Step 1: ensure auth and discover pagination
    scraper, max_page = _ensure_auth_and_get_max_page(db, qoj_username)
    print(f"Detected {max_page} submission pages for {qoj_username}")

    # Now scan submission pages (newest -> older) until we pass start_dt
    relevant_submissions = []
    stop_pagination = False
    for page in range(1, max_page + 1):
        if stop_pagination:
            break
        url = f"{BASE}/submissions?submitter={qoj_username}&page={page}"
        try:
            print(f"Fetching submissions page: {url}")
            r = scraper.get(url, timeout=20)
            if r.status_code != 200:
                print(f"Failed to fetch submissions page {page}: {r.status_code}")
                break
            soup = BeautifulSoup(r.text, "html.parser")

            # Infer server offset for THIS page
            server_offset = _parse_server_time_offset(soup)

            page_items, _ = _parse_submissions_rows_for_page(r.text, server_offset)

            if not page_items:
                # perhaps empty
                continue

            # rows are listed newest first; stop at first < start_dt
            for item in page_items:
                sub_dt = _iso_to_dt(item['submission_time_iso'])
                if sub_dt < start_dt:
                    stop_pagination = True
                    print(f"Reached submission before contest start: {item['submission_time_iso']}")
                    break
                if sub_dt > end_dt:
                    # after contest end, skip
                    continue
                pid = item['problem_id']
                if pid in problem_id_map:
                    print(f"Found relevant submission {item['submission_id']} for problem_id {pid} at {item['submission_time_iso']}")
                    relevant_submissions.append({
                        'submission_id': item['submission_id'],
                        'submission_time': item['submission_time_iso'],
                        'problem_id': pid,
                        'problem_index': problem_id_map[pid]['index'],
                        'problem_name': problem_id_map[pid]['name'],
                        'problem_link': problem_id_map[pid]['link'],
                    })

            time.sleep(0.5)  # rate limit between pages
        except Exception as e:
            print(f"Error processing submissions page {page}: {e}")
            break

    print(f"Found {len(relevant_submissions)} relevant submissions")

    # Step 2: fetch detailed subtask scores for each relevant submission
    detailed_submissions = []
    if relevant_submissions:
        def _worker(sub_info):
            try:
                det = _fetch_submission_details(scraper, sub_info['submission_id'])
                if not det:
                    return None
                # ensure problem id matches; if missing, keep the known one
                problem_id = det['problem_id'] if det['problem_id'] is not None else sub_info['problem_id']
                return {
                    'submission_id': sub_info['submission_id'],
                    'submission_time': sub_info['submission_time'],
                    'problem_id': problem_id,
                    'problem_index': sub_info['problem_index'],
                    'problem_name': sub_info['problem_name'],
                    'problem_link': sub_info['problem_link'],
                    'total_score': det['total_score'],
                    'subtask_scores': det['subtask_scores'],
                }
            except Exception as e:
                print(f"Error fetching submission {sub_info['submission_id']}: {e}")
                return None

        with ThreadPoolExecutor(max_workers=5) as ex:
            for res in ex.map(_worker, relevant_submissions):
                if res:
                    detailed_submissions.append(res)
                time.sleep(0.2)  # gentle pacing

    print(f"Successfully fetched details for {len(detailed_submissions)} submissions")

    # Step 3: compute best subtask-wise scores per problem index, find earliest improvement time
    problem_best = {}  # problem_index -> {'total_score', 'subtask_scores', 'earliest_improvement_time'}

    for sub in detailed_submissions:
        pidx = sub['problem_index']
        if pidx not in problem_best:
            problem_best[pidx] = {
                'total_score': sub['total_score'],
                'subtask_scores': sub['subtask_scores'][:],
                'earliest_improvement_time': sub['submission_time'],
            }
        else:
            current = problem_best[pidx]
            new_scores = []
            improved_any = False
            max_len = max(len(current['subtask_scores']), len(sub['subtask_scores']))
            for i in range(max_len):
                cur = current['subtask_scores'][i] if i < len(current['subtask_scores']) else 0
                nw = sub['subtask_scores'][i] if i < len(sub['subtask_scores']) else 0
                mx = nw if (isinstance(nw, (int, float)) and nw > cur) else cur
                if isinstance(nw, (int, float)) and nw > cur:
                    improved_any = True
                new_scores.append(mx)

            new_total = sum(new_scores)

            if new_total > current['total_score']:
                # update to better total; earliest improvement time = earlier of the two
                cur_t = _iso_to_dt(current['earliest_improvement_time'])
                sub_t = _iso_to_dt(sub['submission_time'])
                earliest = min(cur_t, sub_t)
                problem_best[pidx] = {
                    'total_score': new_total,
                    'subtask_scores': new_scores,
                    'earliest_improvement_time': _dt_to_iso_utc(earliest),
                }
            else:
                # maybe some subtasks improved without total rising (e.g., rounding/plateau)
                if improved_any:
                    sub_t = _iso_to_dt(sub['submission_time'])
                    cur_t = _iso_to_dt(current['earliest_improvement_time'])
                    if sub_t < cur_t:
                        problem_best[pidx]['earliest_improvement_time'] = _dt_to_iso_utc(sub_t)
                    problem_best[pidx]['subtask_scores'] = new_scores

        # Persist each submission (like the oj.uz version)
        db.execute('''
            INSERT OR REPLACE INTO user_virtual_submissions 
            (user_id, contest_name, contest_stage, submission_time, problem_index, score, subtask_scores)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            user_id,
            contest_name,
            contest_stage,
            sub['submission_time'],
            sub['problem_index'],
            sub['total_score'] if isinstance(sub['total_score'], (int, float)) else 0,
            json.dumps(sub['subtask_scores'] if isinstance(sub['subtask_scores'], list) else []),
        ))

    db.commit()

    # Step 4: build summary for all contest problems (attempted or not)
    submissions_summary = []
    for prob in contest_problems:
        pidx = prob['problem_index']
        if pidx in problem_best:
            best = problem_best[pidx]
            submissions_summary.append({
                'problem_index': pidx,
                'problem_name': prob['problem_name'],
                'problem_link': prob['problem_link'],
                'score': best['total_score'],
                'subtask_scores': best['subtask_scores'],
                'submission_time': best['earliest_improvement_time'],
            })
        else:
            submissions_summary.append({
                'problem_index': pidx,
                'problem_name': prob['problem_name'],
                'problem_link': prob['problem_link'],
                'score': 0,
                'subtask_scores': [],
                'submission_time': None,
            })

    submissions_summary.sort(key=lambda x: x['problem_index'])
    print(f"Final scores calculated for {len(submissions_summary)} problems")
    return submissions_summary

def verify_qoj():
    """
    Verify a qoj.ac session cookie (UOJSESSID), detect the logged-in username,
    and persist it into user_settings.platform_usernames under key "qoj.ac".

    Expects JSON body: {"cookie": "<UOJSESSID>"}
    Returns JSON: {valid: True, username: <str>} on success,
    or {valid: False} with 400 if not logged in.
    """
    data = request.get_json() or {}
    qoj_cookie = data.get('cookie')
    if not qoj_cookie:
        return jsonify({"error": "Missing cookie"}), 400
    try:
        scraper = cloudscraper.create_scraper()
        # Set the UOJ session cookie for qoj.ac
        scraper.cookies.set('UOJSESSID', qoj_cookie, domain='qoj.ac', path='/')
        resp = scraper.get(BASE, timeout=5)
        if resp.status_code != 200:
            return jsonify({"error": "Failed to fetch homepage"}), 500

        soup = BeautifulSoup(resp.text, 'html.parser')
        if not _is_logged_in(soup):
            return jsonify({"valid": False}), 400

        # Primary: header badge is a <span class="uoj-username" data-nickname="...">...</span>
        username = None
        badge = soup.select_one('span.uoj-username')
        if badge:
            username = (badge.get('data-nickname') or badge.get_text(strip=True) or '').strip()

        # Fallback: parse the profile link in the dropdown
        if not username:
            m = re.search(r'href="//qoj\.ac/user/profile/([^"]+)"', resp.text)
            if m:
                username = m.group(1).strip()

        if not username:
            # Consider this as not logged in / unexpected layout
            return jsonify({"valid": False}), 400

        # Persist into DB under platform_usernames, creating the row if needed
        with get_db() as db:
            row = db.execute(
                "SELECT platform_usernames FROM user_settings WHERE user_id = ?",
                (request.user_id,)
            ).fetchone()

            if row is None:
                initial = {"qoj.ac": username}
                db.execute(
                    "INSERT INTO user_settings (user_id, platform_usernames) VALUES (?, ?)",
                    (request.user_id, json.dumps(initial, ensure_ascii=False))
                )
                db.commit()
                return jsonify({"valid": True, "username": username})

            current = {}
            try:
                if row["platform_usernames"]:
                    current = json.loads(row["platform_usernames"]) or {}
            except Exception:
                current = {}
            current["qoj.ac"] = username

            db.execute(
                "UPDATE user_settings SET platform_usernames = ? WHERE user_id = ?",
                (json.dumps(current, ensure_ascii=False), request.user_id)
            )
            db.commit()

        return jsonify({"valid": True, "username": username})
    except Exception as e:
        return jsonify({"error": f"Error fetching homepage: {str(e)}"}), 500

SOURCES_FOR_SYNC = [
    'APIO', 'EGOI', 'INOI', 'ZCO', 'IOI', 'JOIFR', 'JOISC', 'IOITC',
    'NOIPRELIM', 'NOIQUAL', 'NOIFINAL', 'POI', 'NOISEL',
    'CEOI', 'COI', 'BOI', 'JOIOC', 'EJOI', 'IZHO', 'ROI', 'BKOI'
]

def update_qoj_scores():
    """
    Full-profile sync for qoj.ac (no contest window).
    Expects JSON body: {"cookie": "<SESSION_ID value>"}
    - Uses the provided cookie as the qoj.ac SESSION_ID (already validated upstream).
    - Fetches all submissions for the user's configured qoj.ac handle.
    - For each problem with a qoj.ac link in our DB, computes best element-wise
      subtask scores across all submissions and upserts into problem_statuses.

    Returns: JSON {success: true, updated: <count>}
    """
    data = request.get_json() or {}
    session_cookie = data.get('cookie')  # qoj.ac SESSION_ID
    if not session_cookie:
        return jsonify({'error': 'Missing cookie'}), 400

    user_id = request.user_id
    db = get_db()

    # Get the user's qoj.ac username from settings
    row = db.execute(
        "SELECT platform_usernames FROM user_settings WHERE user_id = ?",
        (user_id,)
    ).fetchone()
    if not row:
        return jsonify({'error': 'User settings not found'}), 404

    qoj_username = None
    if row['platform_usernames']:
        try:
            pu = json.loads(row['platform_usernames'])
            if isinstance(pu, dict):
                qoj_username = pu.get('qoj.ac')
        except Exception:
            pass
    if not qoj_username:
        return jsonify({'error': 'qoj.ac username not configured in settings'}), 400

    # Fetch all problems that have a qoj.ac link within our Olympiad sources
    placeholders = ', '.join(['?'] * len(SOURCES_FOR_SYNC))
    oj_rows = db.execute(
        f"""
        SELECT
            p.id,
            p.name,
            p.source,
            p.year,
            COALESCE(p.number, 0) AS number,
            pl.url AS qoj_url
        FROM problems p
        JOIN problem_links pl
          ON pl.problem_id = p.id
        WHERE p.source IN ({placeholders})
          AND pl.platform = 'qoj.ac'
        """,
        (*SOURCES_FOR_SYNC,)
    ).fetchall()

    # Map QOJ numeric problem_id -> (problem_db_id, name, source, year)
    problem_map = {}
    for r in oj_rows:
        pid = _extract_problem_id_from_url(r['qoj_url'])
        if pid is not None:
            problem_map[pid] = {
                'db_id': r['id'],
                'name': r['name'],
                'source': r['source'],
                'year': r['year'],
                'link': r['qoj_url'],
            }

    if not problem_map:
        return jsonify({'success': True, 'updated': 0})

    # Prepare an authenticated scraper with the provided UOJSESSID cookie
    scraper = cloudscraper.create_scraper()
    # Set cookie for qoj.ac
    scraper.cookies.set(
        name='UOJSESSID',
        value=session_cookie,
        domain='qoj.ac',
        path='/'
    )
    headers = {
        'User-Agent': 'Mozilla/5.0'
    }

    # Discover max pages first by probing a very large page number
    max_page = _discover_max_page(scraper, qoj_username)
    print(f"[QOJ FULLSYNC] Detected {max_page} submission pages for {qoj_username}.")

    detailed_submissions = []
    for page in range(1, max_page + 1):
        url = f"{BASE}/submissions?submitter={qoj_username}&page={page}"
        try:
            print(f"[QOJ FULLSYNC] Fetching page {page}: {url}")
            r = scraper.get(url, headers=headers, timeout=20)
            if r.status_code != 200:
                print(f"[QOJ FULLSYNC] Non-200 on page {page}: {r.status_code} - stopping.")
                break
            soup = BeautifulSoup(r.text, "html.parser")
            server_offset = _parse_server_time_offset(soup)

            items, _ = _parse_submissions_rows_for_page(r.text, server_offset)
            if not items:
                print(f"[QOJ FULLSYNC] No items on page {page}.")
                continue

            # Filter to our mapped problem ids
            relevant = [it for it in items if it.get('problem_id') in problem_map]

            if relevant:
                # Fetch details in threads
                def _worker(sub_info):
                    try:
                        det = _fetch_submission_details(scraper, sub_info['submission_id'])
                        if not det:
                            return None
                        # ensure problem id
                        pid = det['problem_id'] if det.get('problem_id') is not None else sub_info['problem_id']
                        return {
                            'submission_id': sub_info['submission_id'],
                            'submission_time': sub_info['submission_time_iso'],
                            'problem_id': pid,
                            'total_score': det.get('total_score', 0),
                            'subtask_scores': det.get('subtask_scores') or [],
                        }
                    except Exception as e:
                        print(f"[QOJ FULLSYNC] Error fetching details for {sub_info['submission_id']}: {e}")
                        return None

                with ThreadPoolExecutor(max_workers=6) as ex:
                    for res in ex.map(_worker, relevant):
                        if res:
                            detailed_submissions.append(res)
                        time.sleep(0.05)  # gentle pacing

            time.sleep(0.2)
        except Exception as e:
            print(f"[QOJ FULLSYNC] Exception on page {page}: {e}")
            break

    print(f"[QOJ FULLSYNC] Got {len(detailed_submissions)} detailed submissions to aggregate.")

    # Aggregate best per problem (element-wise subtask max); track earliest improvement time
    problem_best = {}  # pid -> {'total_score', 'subtask_scores', 'earliest_improvement_time'}
    for sub in detailed_submissions:
        pid = sub['problem_id']
        if pid not in problem_map:
            continue
        if pid not in problem_best:
            problem_best[pid] = {
                'total_score': float(sum(sub['subtask_scores'])) if isinstance(sub['subtask_scores'], list) else float(sub['total_score'] or 0),
                'subtask_scores': [float(x) for x in (sub['subtask_scores'] or [])],
                'earliest_improvement_time': sub['submission_time'],
            }
        else:
            cur = problem_best[pid]
            a = cur['subtask_scores']
            b = [float(x) for x in (sub['subtask_scores'] or [])]
            max_len = max(len(a), len(b))
            merged = []
            improved_any = False
            for i in range(max_len):
                va = a[i] if i < len(a) else 0.0
                vb = b[i] if i < len(b) else 0.0
                if vb > va:
                    improved_any = True
                merged.append(vb if vb > va else va)
            new_total = float(sum(merged))
            if new_total > cur['total_score']:
                # better total → keep earliest improvement time among the two
                t_old = _iso_to_dt(cur['earliest_improvement_time'])
                t_new = _iso_to_dt(sub['submission_time'])
                earliest = _dt_to_iso_utc(min(t_old, t_new))
                problem_best[pid] = {
                    'total_score': new_total,
                    'subtask_scores': merged,
                    'earliest_improvement_time': earliest,
                }
            else:
                if improved_any:
                    # total may tie; still update earliest improvement
                    t_old = _iso_to_dt(cur['earliest_improvement_time'])
                    t_new = _iso_to_dt(sub['submission_time'])
                    if t_new < t_old:
                        cur['earliest_improvement_time'] = _dt_to_iso_utc(t_new)
                    cur['subtask_scores'] = merged

    # Upsert into problem_statuses
    updated = 0
    for pid, best in problem_best.items():
        meta = problem_map[pid]
        total = best['total_score']
        # status: 2 if 100, 1 if >0 else 0
        status = 2 if abs(total - 100.0) < 1e-9 or total >= 100 else (1 if total > 0 else 0)

        db.execute(
            """
            INSERT INTO problem_statuses (user_id, problem_name, source, year, status, score)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, problem_name, source, year)
            DO UPDATE SET
              status = CASE WHEN excluded.score > problem_statuses.score THEN excluded.status ELSE problem_statuses.status END,
              score  = MAX(excluded.score, problem_statuses.score)
            """,
            (user_id, meta['name'], meta['source'], meta['year'], status, total)
        )
        updated += 1

    db.commit()
    print(f"[QOJ FULLSYNC] Upserted {updated} problem records for user {user_id}.")
    return jsonify({'success': True, 'updated': updated})
