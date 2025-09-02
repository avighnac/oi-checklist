#!/usr/bin/env python3
"""
SQLite to PostgreSQL Migration Script

This script migrates all data from an existing SQLite database to PostgreSQL.
It handles all 15 tables in the oi-checklist application.

Usage:
    python3 migrate_sqlite_to_postgres.py --sqlite database.db --postgres "postgresql://user@localhost/oi_checklist"
    
Prerequisites:
    1. PostgreSQL database must exist
    2. PostgreSQL schema must be initialized (run init_db.py first)
    3. Source SQLite database must exist and be accessible
"""

import argparse
import sqlite3
import psycopg2
from psycopg2.extras import RealDictCursor
import sys
import os
from typing import Dict, List, Tuple, Any
from datetime import datetime

# Table migration order (respects foreign key dependencies)
MIGRATION_ORDER = [
    'users',
    'auth_identities', 
    'user_settings',
    'sessions',
    'problems',
    'problem_links',
    'problem_statuses',
    'user_problem_notes',
    'contests',
    'contest_scores',
    'contest_problems',
    'user_virtual_contests',
    'user_virtual_submissions',
    'active_virtual_contests',
    'scraper_auth_tokens'
]

def connect_sqlite(db_path: str) -> sqlite3.Connection:
    """Connect to SQLite database"""
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"SQLite database not found: {db_path}")
    
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def connect_postgres(database_url: str) -> psycopg2.extensions.connection:
    """Connect to PostgreSQL database"""
    try:
        conn = psycopg2.connect(database_url)
        conn.cursor_factory = RealDictCursor
        return conn
    except psycopg2.OperationalError as e:
        raise ConnectionError(f"Could not connect to PostgreSQL: {e}")

def get_table_columns(cursor, table_name: str, is_postgres: bool = False) -> List[str]:
    """Get column names for a table"""
    if is_postgres:
        try:
            cursor.execute("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = %s 
                ORDER BY ordinal_position
            """, (table_name,))
            return [row[0] for row in cursor.fetchall()]
        except psycopg2.Error:
            return []
    else:
        try:
            cursor.execute(f"PRAGMA table_info({table_name})")
            return [row[1] for row in cursor.fetchall()]
        except sqlite3.OperationalError:
            return []

def get_table_data(sqlite_cursor, table_name: str) -> List[Dict[str, Any]]:
    """Get all data from SQLite table"""
    try:
        sqlite_cursor.execute(f"SELECT * FROM {table_name}")
        rows = sqlite_cursor.fetchall()
        return [dict(row) for row in rows]
    except sqlite3.OperationalError:
        print(f"Warning: Table {table_name} does not exist in SQLite database")
        return []

def convert_value(value: Any, column_name: str) -> Any:
    """Convert SQLite value to PostgreSQL-compatible value"""
    if value is None:
        return None
    
    # Convert boolean values (SQLite stores as 0/1, PostgreSQL uses true/false)
    if column_name.endswith('_public') or column_name.startswith('asc_') or column_name == 'autosynced':
        return bool(value)
    
    # Handle timestamps - ensure they're properly formatted
    if column_name.endswith('_at') or column_name.endswith('_time'):
        if isinstance(value, str):
            try:
                # Try to parse and reformat timestamp
                dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
                return dt.isoformat()
            except:
                return value
    
    return value

def insert_table_data(pg_cursor, table_name: str, data: List[Dict[str, Any]], pg_columns: List[str]) -> int:
    """Insert data into PostgreSQL table"""
    if not data:
        print(f"  No data to migrate for table {table_name}")
        return 0
    
    # Filter data to only include columns that exist in PostgreSQL
    filtered_data = []
    for row in data:
        filtered_row = {}
        for col in pg_columns:
            if col in row:
                filtered_row[col] = convert_value(row[col], col)
        filtered_data.append(filtered_row)
    
    if not filtered_data:
        print(f"  No compatible data found for table {table_name}")
        return 0
    
    # Build INSERT statement
    columns = list(filtered_data[0].keys())
    placeholders = ', '.join(['%s'] * len(columns))
    
    insert_sql = f"""
        INSERT INTO {table_name} ({', '.join(columns)})
        VALUES ({placeholders})
        ON CONFLICT DO NOTHING
    """
    
    # Insert data in batches
    inserted_count = 0
    for row in filtered_data:
        try:
            values = [row[col] for col in columns]
            pg_cursor.execute(insert_sql, values)
            inserted_count += 1
        except psycopg2.Error as e:
            print(f"    Warning: Failed to insert row in {table_name}: {e}")
            continue
    
    return inserted_count

def migrate_table(sqlite_cursor, pg_cursor, table_name: str) -> Tuple[int, int]:
    """Migrate a single table from SQLite to PostgreSQL"""
    print(f"Migrating table: {table_name}")
    
    # Get table structure
    pg_columns = get_table_columns(pg_cursor, table_name, is_postgres=True)
    if not pg_columns:
        print(f"  Warning: Table {table_name} not found in PostgreSQL")
        return 0, 0
    
    # Get data from SQLite
    data = get_table_data(sqlite_cursor, table_name)
    total_rows = len(data)
    
    if total_rows == 0:
        print(f"  Table {table_name} is empty")
        return 0, 0
    
    # Insert data into PostgreSQL
    inserted_rows = insert_table_data(pg_cursor, table_name, data, pg_columns)
    
    print(f"  Migrated {inserted_rows}/{total_rows} rows")
    return inserted_rows, total_rows

def reset_sequences(pg_cursor):
    """Reset PostgreSQL sequences to correct values after data import"""
    print("\nResetting PostgreSQL sequences...")
    
    # Tables with SERIAL primary keys that need sequence resets
    serial_tables = [
        'users', 'auth_identities', 'problems', 'problem_links'
    ]
    
    for table in serial_tables:
        try:
            pg_cursor.execute(f"""
                SELECT setval(pg_get_serial_sequence('{table}', 'id'), 
                             COALESCE(MAX(id), 1)) 
                FROM {table}
            """)
            print(f"  Reset sequence for {table}")
        except psycopg2.Error as e:
            print(f"  Warning: Could not reset sequence for {table}: {e}")

def verify_migration(sqlite_cursor, pg_cursor) -> bool:
    """Verify migration completed successfully"""
    print("\nVerifying migration...")
    
    all_match = True
    for table_name in MIGRATION_ORDER:
        try:
            # Count rows in both databases
            sqlite_cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
            sqlite_count = sqlite_cursor.fetchone()[0]
            
            pg_cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
            pg_count = pg_cursor.fetchone()[0]
            
            if sqlite_count == pg_count:
                print(f"  ✓ {table_name}: {pg_count} rows")
            else:
                print(f"  ✗ {table_name}: SQLite={sqlite_count}, PostgreSQL={pg_count}")
                all_match = False
                
        except (sqlite3.OperationalError, psycopg2.Error) as e:
            print(f"  ? {table_name}: Could not verify ({e})")
    
    return all_match

def main():
    parser = argparse.ArgumentParser(description='Migrate SQLite database to PostgreSQL')
    parser.add_argument('--sqlite', required=True, help='Path to SQLite database file')
    parser.add_argument('--postgres', required=True, help='PostgreSQL connection URL')
    parser.add_argument('--verify', action='store_true', help='Only verify existing migration')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be migrated without actually doing it')
    
    args = parser.parse_args()
    
    # Connect to databases
    print(f"Connecting to SQLite: {args.sqlite}")
    sqlite_conn = connect_sqlite(args.sqlite)
    sqlite_cursor = sqlite_conn.cursor()
    
    if args.dry_run:
        print("\nDRY RUN - showing what would be migrated:")
        for table_name in MIGRATION_ORDER:
            data = get_table_data(sqlite_cursor, table_name)
            print(f"  {table_name}: {len(data)} rows would be migrated")
        sqlite_conn.close()
        return 0
    
    print(f"Connecting to PostgreSQL: {args.postgres}")
    pg_conn = connect_postgres(args.postgres)
    pg_cursor = pg_conn.cursor()
    
    try:
        if args.verify:
            # Only verify migration
            success = verify_migration(sqlite_cursor, pg_cursor)
            print(f"\nVerification {'PASSED' if success else 'FAILED'}")
            return 0 if success else 1
        
    try:
        if args.verify:
            # Only verify migration
            success = verify_migration(sqlite_cursor, pg_cursor)
            print(f"\nVerification {'PASSED' if success else 'FAILED'}")
            return 0 if success else 1
        
        # Check if PostgreSQL schema is initialized
        pg_cursor.execute("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'")
        table_count = pg_cursor.fetchone()[0]
        if table_count < len(MIGRATION_ORDER):
            print(f"\nWarning: PostgreSQL database appears to be missing tables ({table_count}/{len(MIGRATION_ORDER)} found)")
            print("Please run 'python3 backend/database/init/init_db.py' first to initialize the schema")
            print("Then run this migration script again")
            return 1
        
        # Perform migration
        print(f"\nStarting migration of {len(MIGRATION_ORDER)} tables...")
        
        total_inserted = 0
        total_source = 0
        
        for table_name in MIGRATION_ORDER:
            inserted, source = migrate_table(sqlite_cursor, pg_cursor, table_name)
            total_inserted += inserted
            total_source += source
        
        # Reset sequences
        reset_sequences(pg_cursor)
        
        # Commit changes
        pg_conn.commit()
        
        print(f"\nMigration completed!")
        print(f"Total rows migrated: {total_inserted}/{total_source}")
        
        # Verify migration
        success = verify_migration(sqlite_cursor, pg_cursor)
        if success:
            print("\n✓ Migration verification PASSED")
            return 0
        else:
            print("\n✗ Migration verification FAILED")
            return 1
            
    except Exception as e:
        print(f"\nMigration failed: {e}")
        pg_conn.rollback()
        return 1
        
    finally:
        sqlite_conn.close()
        if not args.dry_run:
            pg_conn.close()

if __name__ == '__main__':
    sys.exit(main())