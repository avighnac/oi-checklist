import sqlite3
import os
from dotenv import load_dotenv

load_dotenv()

db_path = os.getenv("DATABASE_PATH", "database.db")  # fallback to "database.db" if not set
conn = sqlite3.connect(db_path)
c = conn.cursor()

c.execute('''CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    salt TEXT NOT NULL
)''')


c.execute('''CREATE TABLE problems (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    number INTEGER,
    source TEXT,
    year INTEGER,
    link TEXT
)''')

c.execute('''
CREATE TABLE problem_statuses (
    user_id INTEGER,
    problem_name TEXT,
    source TEXT,
    year INTEGER,
    status INTEGER DEFAULT 0,
    score INTEGER DEFAULT 0,
    PRIMARY KEY(user_id, problem_name, source, year),
    FOREIGN KEY(user_id) REFERENCES users(id)
)
''')

conn.commit()
conn.close()
