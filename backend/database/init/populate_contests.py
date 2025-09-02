#!/usr/bin/env python3
import os
import sys
import json
import subprocess
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

CONTESTS_DIR = BACKEND_DIR / "data" / "contests"
COMPILE_TO_JSON = CONTESTS_DIR / "compile_to_json.py"
JSON_OUT = BACKEND_DIR / "contests.tmp.json"

if not COMPILE_TO_JSON.is_file():
    raise FileNotFoundError(f"compile_to_json.py not found at: {COMPILE_TO_JSON}")

subprocess.run(
    [sys.executable, str(COMPILE_TO_JSON), str(CONTESTS_DIR), "--output", str(JSON_OUT)],
    check=True,
)

with JSON_OUT.open("r", encoding="utf-8") as f:
    contests = json.load(f)

yaml_files_by_dir = defaultdict(set)

conn = get_db()
cur = conn.cursor()

# Check if we're using PostgreSQL or SQLite
database_url = os.getenv("DATABASE_URL")
is_postgres = database_url is not None

if not is_postgres:
    # SQLite: Enforce FKs and set manual transactions
    cur.execute("PRAGMA foreign_keys = ON;")
    # Manual transactions
    conn.isolation_level = None

def normalize_extra(val):
    if val is None:
        return None
    if isinstance(val, str) and val.strip() == "":
        return None
    return val

def normalize_stage(val):
    if val is None:
        return None
    s = str(val).strip()
    return None if s == "" else s

def delete_children_for_contest(name, stage):
    if stage is None:
        cur.execute(
            "DELETE FROM contest_problems WHERE contest_name = ? AND contest_stage IS NULL",
            (name,),
        )
        cur.execute(
            "DELETE FROM contest_scores WHERE contest_name = ? AND contest_stage IS NULL",
            (name,),
        )
    else:
        cur.execute(
            "DELETE FROM contest_problems WHERE contest_name = ? AND contest_stage = ?",
            (name, stage),
        )
        cur.execute(
            "DELETE FROM contest_scores WHERE contest_name = ? AND contest_stage = ?",
            (name, stage),
        )

try:
    cur.execute("BEGIN;")

    for contest in contests:
        name   = contest["name"]
        source = contest["source"]
        year   = contest["year"]
        stage  = normalize_stage(contest.get("stage"))  # None or trimmed string

        # 1) Upsert contests
        if stage is None:
            # Uses partial unique index uq_contests_name_nullstage
            cur.execute(
                """
                INSERT INTO contests (
                    name, stage, location, duration_minutes, source, year,
                    date, website, link, notes
                ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(name) WHERE stage IS NULL DO UPDATE SET
                    location         = excluded.location,
                    duration_minutes = excluded.duration_minutes,
                    source           = excluded.source,
                    year             = excluded.year,
                    date             = excluded.date,
                    website          = excluded.website,
                    link             = excluded.link,
                    notes            = excluded.notes
                """,
                (
                    name,
                    contest.get("location"),
                    contest.get("duration_minutes"),
                    source,
                    year,
                    contest.get("date"),
                    contest.get("website"),
                    contest.get("link"),
                    contest.get("notes"),
                ),
            )
        else:
            cur.execute(
                """
                INSERT INTO contests (
                    name, stage, location, duration_minutes, source, year,
                    date, website, link, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(name, stage) DO UPDATE SET
                    location         = excluded.location,
                    duration_minutes = excluded.duration_minutes,
                    source           = excluded.source,
                    year             = excluded.year,
                    date             = excluded.date,
                    website          = excluded.website,
                    link             = excluded.link,
                    notes            = excluded.notes
                """,
                (
                    name,
                    stage,
                    contest.get("location"),
                    contest.get("duration_minutes"),
                    source,
                    year,
                    contest.get("date"),
                    contest.get("website"),
                    contest.get("link"),
                    contest.get("notes"),
                ),
            )

        # 2) Replace children rows for THIS contest only
        delete_children_for_contest(name, stage)

        # 3) Insert problems for the contest
        for i, p in enumerate(contest.get("problems", []), start=1):
            problem_extra = normalize_extra(p.get("extra"))
            cur.execute(
                """
                INSERT INTO contest_problems (
                    contest_name, contest_stage,
                    problem_source, problem_year, problem_number, problem_extra,
                    problem_index
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    name,
                    stage,  # may be None; FK matches NULL correctly
                    p["source"],
                    p["year"],
                    p["number"],
                    problem_extra,
                    i,
                ),
            )

        # 4) Insert contest_scores (if present)
        scores_data = contest.get("scores")
        if scores_data:
            problem_keys = sorted(scores_data.keys(), key=int)
            problem_scores = [scores_data[k] for k in problem_keys]

            medal_cutoffs_block = contest.get("medal_cutoffs")
            if isinstance(medal_cutoffs_block, list) and medal_cutoffs_block:
                cutoffs = medal_cutoffs_block[0]
                medal_names   = list(cutoffs.keys())
                medal_cutoffs = [cutoffs[m] for m in medal_names]

                cur.execute(
                    """
                    INSERT INTO contest_scores (
                        contest_name, contest_stage,
                        medal_names, medal_cutoffs, problem_scores
                    ) VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        name,
                        stage,
                        json.dumps(medal_names),
                        json.dumps(medal_cutoffs),
                        json.dumps(problem_scores),
                    ),
                )

        # (Pretty-print/debug: record YAML origin)
        if stage is None:
            rel_path = Path("data") / "contests" / source.lower() / f"{year}.yaml"
        else:
            rel_path = Path("data") / "contests" / source.lower() / str(year) / f"{stage.replace(' ', '_')}.yaml"
        yaml_files_by_dir[str(rel_path.parent)].add(rel_path.name)

    cur.execute("COMMIT;")
except Exception:
    cur.execute("ROLLBACK;")
    raise
finally:
    conn.close()

# Pretty print YAML structure preview
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
