import os
import sys
import json
import subprocess
import re
from urllib.parse import urlparse, urlsplit, urlunsplit
from pathlib import Path
from collections import defaultdict
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

# Add parent directory to path to import database module
sys.path.append(str(Path(__file__).parent.parent))
from db import get_db

backend_dir_env = os.getenv("BACKEND_DIR")
if not backend_dir_env:
    raise RuntimeError("BACKEND_DIR not set in environment variables")

BACKEND_DIR = Path(backend_dir_env).resolve()

DATA_DIR = BACKEND_DIR / "data" / "problems"
YAML_TO_JSON = DATA_DIR / "yaml_to_json.py"

if not YAML_TO_JSON.is_file():
    raise FileNotFoundError(f"yaml_to_json.py not found at: {YAML_TO_JSON}")

JSON_OUT = BACKEND_DIR / "problems.tmp.json"

subprocess.run(
    [sys.executable, str(YAML_TO_JSON), str(DATA_DIR), "--output", str(JSON_OUT)],
    check=True,
)

with JSON_OUT.open("r", encoding="utf-8") as f:
    problems = json.load(f)

yaml_files_by_dir = defaultdict(set)

conn = get_db()
cur = conn.cursor()

# Check if we're using PostgreSQL or SQLite
database_url = os.getenv("DATABASE_URL")
is_postgres = database_url is not None

if not is_postgres:
    # SQLite: Ensure FK cascade works (needed per-connection in SQLite)
    cur.execute("PRAGMA foreign_keys = ON;")

# Hostname → platform map
DEFAULT_HOSTNAME_MAP = {
    "acmicpc.net": "baekjoon",
    "atcoder.jp": "atcoder",
    "cms.iarcs.org.in": "cms",
    "codebreaker.xyz": "codebreaker",
    "codechef.com": "codechef",
    "codedrills.io": "codedrills",
    "codeforces.com": "codeforces",
    "dmoj.ca": "dmoj",
    "icpc.codedrills.io": "codedrills",
    "oj.uz": "oj.uz",
    "qoj.ac": "qoj.ac",
    "szkopul.edu.pl": "szkopuł",
    "usaco.org": "usaco",
}

def _force_https(url: str | None) -> str | None:
    """
    Normalize any URL to use https scheme.
    - If URL is protocol-relative ("//host/..."), prefix https://
    - If URL has no scheme, assume https://
    - If URL uses http, upgrade to https
    - Preserve path/query/fragment
    """
    if not url:
        return None
    s = url.strip()
    if not s:
        return None

    # Handle protocol-relative URLs
    if s.startswith("//"):
        s = "https:" + s

    # If there's no scheme, prepend https://
    if not re.match(r"^[a-zA-Z][a-zA-Z0-9+.\-]*://", s):
        s = "https://" + s

    parts = urlsplit(s)
    scheme = "https"  # force https
    # Rebuild with https scheme, keep everything else
    return urlunsplit((scheme, parts.netloc, parts.path, parts.query, parts.fragment))

def _hostname(url: str | None) -> str | None:
    url = _force_https(url)
    if not url:
        return None
    try:
        h = (urlparse(url).hostname or "").lower()
        return h[4:] if h.startswith("www.") else h
    except Exception:
        return None

def _infer_platform(url: str | None) -> str:
    h = _hostname(url)
    if not h:
        return "unknown"
    return DEFAULT_HOSTNAME_MAP.get(h, h)

def normalize_links(entry: dict) -> list[dict]:
    """
    Build a normalized list of link dicts: [{platform, url}], deduped,
    and with every URL forced to https.
    """
    out = []
    if "links" in entry and entry["links"] is not None:
        links = entry["links"]
        if isinstance(links, list):
            for item in links:
                if isinstance(item, str):
                    url = _force_https(item)
                    out.append({"platform": _infer_platform(url), "url": url})
                elif isinstance(item, dict):
                    url = _force_https(item.get("url"))
                    plat = item.get("platform") or _infer_platform(url)
                    out.append({"platform": plat, "url": url})
        elif isinstance(links, dict):
            for plat, url in links.items():
                nurl = _force_https(str(url))
                out.append({"platform": str(plat), "url": nurl})
    if "link" in entry and entry["link"]:
        url = _force_https(entry["link"])
        out.append({"platform": _infer_platform(url), "url": url})

    # de-dup (platform, url)
    seen = set()
    deduped = []
    for d in out:
        key = (d.get("platform"), d.get("url"))
        if key not in seen and d.get("url"):
            seen.add(key)
            deduped.append(d)
    return deduped

def normalize_extra(val) -> str | None:
    """Return None for missing/empty/whitespace extras so DB stores NULL."""
    if val is None:
        return None
    if isinstance(val, str):
        s = val.strip()
        return s if s != "" else None
    # Any non-string 'extra' is unexpected; treat as stringified
    return str(val)

# Atomic wipe & repopulate
cur.execute("BEGIN;")
try:
    # WARNING: This deletes ALL problems. If other tables (e.g. contest_problems)
    # reference problems with ON DELETE CASCADE, they will also be cleared.
    cur.execute("DELETE FROM problems")

    for p in problems:
        extra = normalize_extra(p.get("extra"))

        # Build a relative path for display/debug only (doesn't affect DB)
        if extra is not None:
            rel_path = (
                Path("data") / "problems" / p["source"].lower() / str(p["year"]) /
                f"{extra.replace(' ', '_')}.yaml"
            )
        else:
            rel_path = Path("data") / "problems" / p["source"].lower() / f"{p['year']}.yaml"

        yaml_files_by_dir[str(rel_path.parent)].add(rel_path.name)

        links = normalize_links(p)

        if "number" in p:
            cur.execute(
                """
                INSERT INTO problems (name, number, source, year, extra)
                VALUES (?, ?, ?, ?, ?)
                """,
                (p["name"], p["number"], p["source"], p["year"], extra),
            )
        else:
            cur.execute(
                """
                INSERT INTO problems (name, source, year, extra)
                VALUES (?, ?, ?, ?)
                """,
                (p["name"], p["source"], p["year"], extra),
            )
        problem_id = cur.lastrowid

        # Insert problem_links (URLs already normalized to https)
        for link in links:
            plat = link.get("platform")
            url = link.get("url")
            if not url:
                continue
            cur.execute(
                """
                INSERT OR IGNORE INTO problem_links (problem_id, platform, url)
                VALUES (?, ?, ?)
                """,
                (problem_id, plat, url),
            )

    conn.commit()
except Exception:
    conn.rollback()
    raise
finally:
    conn.close()

print("Processed YAML structure:")
for directory in sorted(yaml_files_by_dir):
    print(f"📂 {directory}/")
    files = sorted(yaml_files_by_dir[directory])
    display = files if len(files) <= 3 else [files[0], "...", files[-1]]
    for i, file in enumerate(display):
        prefix = "└── " if i == len(display) - 1 else "├── "
        print(f"    {prefix}{file}")

# Cleanup temp JSON
try:
    JSON_OUT.unlink()
    print(f"Deleted temporary file: {JSON_OUT}")
except OSError as e:
    print(f"Warning: could not delete {JSON_OUT}: {e}")
