import os
import sys
from dotenv import load_dotenv

# Add parent directory to path to import database module
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))
from database.db import get_db

load_dotenv()

conn = get_db()
c = conn.cursor()

# Check if we're using PostgreSQL or SQLite
database_url = os.getenv("DATABASE_URL")
is_postgres = database_url is not None

if not is_postgres:
    # SQLite: Always enforce FKs
    c.execute('PRAGMA foreign_keys = ON;')

# Define table creation SQL based on database type
if is_postgres:
    users_sql = '''CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )'''
else:
    users_sql = '''CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )'''

c.execute(users_sql)

if is_postgres:
    auth_identities_sql = '''CREATE TABLE auth_identities (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        provider TEXT NOT NULL,
        provider_user_id TEXT,
        display_name TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(provider, provider_user_id),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )'''
else:
    auth_identities_sql = '''CREATE TABLE auth_identities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        provider TEXT NOT NULL,
        provider_user_id TEXT,
        display_name TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(provider, provider_user_id),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )'''

c.execute(auth_identities_sql)

if is_postgres:
    problems_sql = '''CREATE TABLE problems (
        id SERIAL PRIMARY KEY,
        name TEXT,
        number INTEGER,
        source TEXT,
        year INTEGER,
        extra TEXT,
        UNIQUE(source, year, number, extra)
    )'''
else:
    problems_sql = '''CREATE TABLE problems (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        number INTEGER,
        source TEXT,
        year INTEGER,
        extra TEXT,
        UNIQUE(source, year, number, extra)
    )'''

c.execute(problems_sql)

if is_postgres:
    problem_links_sql = '''CREATE TABLE problem_links (
        id SERIAL PRIMARY KEY,
        problem_id INTEGER NOT NULL,
        platform TEXT NOT NULL,
        url TEXT NOT NULL,
        UNIQUE (problem_id, platform, url),
        FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE
    )'''
else:
    problem_links_sql = '''CREATE TABLE problem_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        problem_id INTEGER NOT NULL,
        platform TEXT NOT NULL,
        url TEXT NOT NULL,
        UNIQUE (problem_id, platform, url),
        FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE
    )'''

c.execute(problem_links_sql)

# Create remaining tables (these are compatible between SQLite and PostgreSQL)
if is_postgres:
    user_settings_sql = '''CREATE TABLE user_settings (
        user_id INTEGER PRIMARY KEY,
        checklist_public BOOLEAN NOT NULL DEFAULT FALSE,
        olympiad_order TEXT DEFAULT NULL,
        asc_sort BOOLEAN NOT NULL DEFAULT FALSE,
        platform_pref TEXT,
        hidden TEXT DEFAULT NULL,
        local_storage TEXT DEFAULT NULL,
        platform_usernames TEXT DEFAULT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )'''
    
    active_virtual_contests_sql = '''CREATE TABLE active_virtual_contests (
        user_id INTEGER PRIMARY KEY,
        contest_name TEXT NOT NULL,
        contest_stage TEXT,
        start_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        end_time TIMESTAMP,
        autosynced BOOLEAN NOT NULL DEFAULT FALSE,
        score REAL,
        per_problem_scores TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(contest_name, contest_stage) REFERENCES contests(name, stage) ON DELETE CASCADE
    )'''
else:
    user_settings_sql = '''CREATE TABLE user_settings (
        user_id INTEGER PRIMARY KEY,
        checklist_public BOOLEAN NOT NULL DEFAULT 0,
        olympiad_order TEXT DEFAULT NULL,
        asc_sort BOOLEAN NOT NULL DEFAULT 0,
        platform_pref TEXT,
        hidden TEXT DEFAULT NULL,
        local_storage TEXT DEFAULT NULL,
        platform_usernames TEXT DEFAULT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )'''
    
    active_virtual_contests_sql = '''CREATE TABLE active_virtual_contests (
        user_id INTEGER PRIMARY KEY,
        contest_name TEXT NOT NULL,
        contest_stage TEXT,
        start_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        end_time TIMESTAMP,
        autosynced BOOLEAN NOT NULL DEFAULT 0,
        score REAL,
        per_problem_scores TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(contest_name, contest_stage) REFERENCES contests(name, stage) ON DELETE CASCADE
    )'''

c.execute('''
CREATE TABLE problem_statuses (
    user_id INTEGER,
    problem_name TEXT,
    source TEXT,
    year INTEGER,
    status INTEGER DEFAULT 0,
    score REAL DEFAULT 0,
    PRIMARY KEY(user_id, problem_name, source, year),
    FOREIGN KEY(user_id) REFERENCES users(id)
)
''')

c.execute('''
CREATE TABLE user_problem_notes (
    user_id INTEGER NOT NULL,
    problem_name TEXT NOT NULL,
    source TEXT NOT NULL,
    year INTEGER NOT NULL,
    note TEXT DEFAULT '',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, problem_name, source, year),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
)
''')

c.execute(user_settings_sql)

c.execute('''
CREATE TABLE sessions (
    session_id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
)''')

c.execute('''
CREATE TABLE contests (
    name TEXT NOT NULL,
    stage TEXT,
    location TEXT,
    duration_minutes INTEGER,
    source TEXT NOT NULL,
    year INTEGER NOT NULL,
    date DATE,
    website TEXT,
    link TEXT,
    notes TEXT,
    PRIMARY KEY(name, stage),
    CHECK (stage IS NULL OR TRIM(stage) <> '')
)''')

c.execute('''CREATE TABLE contest_scores (
    contest_name TEXT NOT NULL,
    contest_stage TEXT,
    medal_names TEXT,
    medal_cutoffs TEXT,
    problem_scores TEXT,
    PRIMARY KEY(contest_name, contest_stage),
    FOREIGN KEY(contest_name, contest_stage)
        REFERENCES contests(name, stage) ON DELETE CASCADE
)''')

c.execute('''
CREATE TABLE contest_problems (
    contest_name   TEXT NOT NULL,
    contest_stage  TEXT,
    problem_source TEXT,
    problem_year   INTEGER,
    problem_number INTEGER,
    problem_extra  TEXT,
    problem_index  INTEGER NOT NULL,
    PRIMARY KEY (contest_name, contest_stage, problem_index),
    FOREIGN KEY (contest_name, contest_stage)
        REFERENCES contests(name, stage) ON DELETE CASCADE,
    FOREIGN KEY (problem_source, problem_year, problem_number, problem_extra)
        REFERENCES problems(source, year, number, extra) ON DELETE CASCADE
)''')

c.execute('''
  CREATE TABLE user_virtual_contests (
    user_id INTEGER NOT NULL,
    contest_name TEXT NOT NULL,
    contest_stage TEXT,
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    score REAL,
    per_problem_scores TEXT,
    PRIMARY KEY(user_id, contest_name, contest_stage),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(contest_name, contest_stage) REFERENCES contests(name, stage) ON DELETE CASCADE
)''')

c.execute('''
CREATE TABLE user_virtual_submissions (
    user_id INTEGER NOT NULL,
    contest_name TEXT NOT NULL,
    contest_stage TEXT,
    submission_time TIMESTAMP NOT NULL,
    problem_index INTEGER NOT NULL,
    score REAL NOT NULL,
    subtask_scores TEXT NOT NULL,
    FOREIGN KEY(user_id, contest_name, contest_stage)
        REFERENCES user_virtual_contests(user_id, contest_name, contest_stage)
        ON DELETE CASCADE
)''')

c.execute(active_virtual_contests_sql)

c.execute('''
CREATE TABLE scraper_auth_tokens (
    platform TEXT NOT NULL,
    token TEXT NOT NULL       
)''')

# Create unique index - PostgreSQL and SQLite have the same syntax for this
c.execute('''
CREATE UNIQUE INDEX uq_contests_name_nullstage
ON contests(name)
WHERE stage IS NULL;
''')

conn.commit()
conn.close()
