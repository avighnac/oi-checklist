import os
import sqlite3
import psycopg2
from psycopg2 import sql
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()

class PostgreSQLWrapper:
    """Wrapper for PostgreSQL connection to provide unified execute interface."""
    
    def __init__(self, connection):
        self.connection = connection
        self.connection.cursor_factory = RealDictCursor
    
    def execute(self, query, params=None):
        """Execute a query and return a cursor-like object."""
        cursor = self.connection.cursor()
        if params:
            # Convert SQLite-style ? placeholders to PostgreSQL-style %s
            pg_query = query.replace('?', '%s')
            cursor.execute(pg_query, params)
        else:
            # Convert SQLite-style ? placeholders to PostgreSQL-style %s
            pg_query = query.replace('?', '%s')
            cursor.execute(pg_query)
        return cursor
    
    def cursor(self):
        """Get a cursor for manual operations."""
        return self.connection.cursor()
    
    def commit(self):
        """Commit the transaction."""
        self.connection.commit()
    
    def rollback(self):
        """Rollback the transaction."""
        self.connection.rollback()
    
    def close(self):
        """Close the connection."""
        self.connection.close()
    
    def __enter__(self):
        """Context manager entry."""
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        if exc_type is None:
            self.commit()
        else:
            self.rollback()
        self.close()

def get_db():
    """
    Get database connection. Supports both SQLite and PostgreSQL.
    Use DATABASE_URL for PostgreSQL or DATABASE_PATH for SQLite.
    """
    database_url = os.getenv("DATABASE_URL")
    
    if database_url:
        # PostgreSQL connection
        conn = psycopg2.connect(database_url)
        return PostgreSQLWrapper(conn)
    else:
        # SQLite connection (fallback)
        db_path = os.getenv("DATABASE_PATH", "database.db")
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        return conn