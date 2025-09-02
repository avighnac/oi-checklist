import os
import sqlite3
import psycopg2
from psycopg2 import sql
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()

def get_db():
    """
    Get database connection. Supports both SQLite and PostgreSQL.
    Use DATABASE_URL for PostgreSQL or DATABASE_PATH for SQLite.
    """
    database_url = os.getenv("DATABASE_URL")
    
    if database_url:
        # PostgreSQL connection
        conn = psycopg2.connect(database_url)
        # Use RealDictCursor to get dict-like row behavior similar to sqlite3.Row
        conn.cursor_factory = RealDictCursor
        return conn
    else:
        # SQLite connection (fallback)
        db_path = os.getenv("DATABASE_PATH", "database.db")
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        return conn