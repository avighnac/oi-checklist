#!/usr/bin/env python3
"""
Test script for SQLite to PostgreSQL migration.

This script creates dummy data for all 15 tables in the oi-checklist database,
then tests the migration script to ensure it works correctly.

Usage:
    python3 test_migration.py [--test-db test_database.db]
"""

import argparse
import sqlite3
import tempfile
import os
import sys
import subprocess
from datetime import datetime, timedelta
import random
import string

# Add backend to path for imports
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

def generate_random_string(length: int = 10) -> str:
    """Generate random string for testing"""
    return ''.join(random.choices(string.ascii_letters + string.digits, k=length))

def create_test_sqlite_db(db_path: str):
    """Create SQLite database with dummy data for all 15 tables"""
    
    # First initialize the schema
    print(f"Creating test SQLite database: {db_path}")
    
    # Set environment variable for SQLite database
    os.environ['DATABASE_PATH'] = db_path
    os.environ.pop('DATABASE_URL', None)  # Make sure PostgreSQL URL is not set
    
    # Run init_db.py to create schema
    init_script = os.path.join(os.path.dirname(__file__), 'init', 'init_db.py')
    result = subprocess.run([sys.executable, init_script], capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Failed to initialize database schema: {result.stderr}")
        sys.exit(1)
    
    # Connect and populate with dummy data
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    
    try:
        print("Populating with dummy data...")
        
        # 1. users table
        users_data = [
            (1, 'testuser1', 'hashed_password_1', '2023-01-01 12:00:00'),
            (2, 'testuser2', 'hashed_password_2', '2023-01-02 12:00:00'),
            (3, 'testuser3', None, '2023-01-03 12:00:00'),  # OAuth user without password
        ]
        c.executemany('INSERT INTO users (id, username, password, created_at) VALUES (?, ?, ?, ?)', users_data)
        
        # 2. auth_identities table
        auth_data = [
            (1, 1, 'github', 'github123', 'Test User 1', '2023-01-01 12:00:00'),
            (2, 2, 'google', 'google456', 'Test User 2', '2023-01-02 12:00:00'),
            (3, 3, 'discord', 'discord789', 'Test User 3', '2023-01-03 12:00:00'),
        ]
        c.executemany('INSERT INTO auth_identities (id, user_id, provider, provider_user_id, display_name, created_at) VALUES (?, ?, ?, ?, ?, ?)', auth_data)
        
        # 3. user_settings table
        settings_data = [
            (1, 1, 'IOI,USACO', 0, 'codeforces', 'USACO Bronze', '{"theme": "dark"}', '{"codeforces": "user1"}'),
            (2, 0, 'IOI', 1, 'atcoder', None, '{"theme": "light"}', '{"atcoder": "user2"}'),
            (3, 1, None, 0, None, None, None, None),
        ]
        c.executemany('INSERT INTO user_settings (user_id, checklist_public, olympiad_order, asc_sort, platform_pref, hidden, local_storage, platform_usernames) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', settings_data)
        
        # 4. sessions table  
        session_data = [
            ('session_1_' + generate_random_string(20), 1, '2023-01-01 12:00:00'),
            ('session_2_' + generate_random_string(20), 2, '2023-01-02 12:00:00'),
            ('session_3_' + generate_random_string(20), 3, '2023-01-03 12:00:00'),
        ]
        c.executemany('INSERT INTO sessions (session_id, user_id, created_at) VALUES (?, ?, ?)', session_data)
        
        # 5. problems table
        problems_data = [
            (1, 'Two Sum', 1, 'IOI', 2020, 'day1'),
            (2, 'Tree Distances', 2, 'IOI', 2020, 'day1'), 
            (3, 'Subsequences', 1, 'IOI', 2021, 'day1'),
            (4, 'Keys', 2, 'IOI', 2021, 'day1'),
            (5, 'Problem A', 1, 'USACO', 2023, 'bronze'),
        ]
        c.executemany('INSERT INTO problems (id, name, number, source, year, extra) VALUES (?, ?, ?, ?, ?, ?)', problems_data)
        
        # 6. problem_links table
        links_data = [
            (1, 1, 'codeforces', 'https://codeforces.com/problem/1'),
            (2, 1, 'atcoder', 'https://atcoder.jp/contests/abc123/tasks/abc123_a'),
            (3, 2, 'codeforces', 'https://codeforces.com/problem/2'),
            (4, 3, 'oj', 'https://oj.uz/problem/view/IOI21_1'),
        ]
        c.executemany('INSERT INTO problem_links (id, problem_id, platform, url) VALUES (?, ?, ?, ?)', links_data)
        
        # 7. problem_statuses table
        status_data = [
            (1, 'Two Sum', 'IOI', 2020, 2, 100.0),
            (1, 'Tree Distances', 'IOI', 2020, 1, 50.0),
            (2, 'Two Sum', 'IOI', 2020, 2, 100.0),
            (2, 'Subsequences', 'IOI', 2021, 0, 0.0),
        ]
        c.executemany('INSERT INTO problem_statuses (user_id, problem_name, source, year, status, score) VALUES (?, ?, ?, ?, ?, ?)', status_data)
        
        # 8. user_problem_notes table
        notes_data = [
            (1, 'Two Sum', 'IOI', 2020, 'Good problem for beginners', '2023-01-01 12:00:00'),
            (1, 'Tree Distances', 'IOI', 2020, 'Need to review tree algorithms', '2023-01-02 12:00:00'),
            (2, 'Two Sum', 'IOI', 2020, 'Easy problem', '2023-01-03 12:00:00'),
        ]
        c.executemany('INSERT INTO user_problem_notes (user_id, problem_name, source, year, note, updated_at) VALUES (?, ?, ?, ?, ?, ?)', notes_data)
        
        # 9. contests table
        contests_data = [
            ('IOI 2020', 'day1', 'Singapore', 300, 'IOI', 2020, '2020-09-13', 'https://ioi2020.sg', 'https://ioi2020.sg/contest', 'Virtual contest'),
            ('IOI 2020', 'day2', 'Singapore', 300, 'IOI', 2020, '2020-09-14', 'https://ioi2020.sg', 'https://ioi2020.sg/contest', 'Virtual contest'),
            ('IOI 2021', 'day1', 'Singapore', 300, 'IOI', 2021, '2021-06-20', 'https://ioi2021.sg', 'https://ioi2021.sg/contest', 'Virtual contest'),
            ('USACO US Open 2023', 'bronze', 'Online', 240, 'USACO', 2023, '2023-03-17', 'http://usaco.org', 'http://usaco.org/contest', 'Bronze division'),
        ]
        c.executemany('INSERT INTO contests (name, stage, location, duration_minutes, source, year, date, website, link, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', contests_data)
        
        # 10. contest_scores table
        contest_scores_data = [
            ('IOI 2020', 'day1', 'Gold,Silver,Bronze', '300,200,100', '100,100'),
            ('IOI 2020', 'day2', 'Gold,Silver,Bronze', '300,200,100', '100,100'),
            ('IOI 2021', 'day1', 'Gold,Silver,Bronze', '300,200,100', '100,100'),
            ('USACO US Open 2023', 'bronze', 'Promoted,Not Promoted', '750,0', '250,250,250'),
        ]
        c.executemany('INSERT INTO contest_scores (contest_name, contest_stage, medal_names, medal_cutoffs, problem_scores) VALUES (?, ?, ?, ?, ?)', contest_scores_data)
        
        # 11. contest_problems table
        contest_problems_data = [
            ('IOI 2020', 'day1', 'IOI', 2020, 1, 'day1', 0),
            ('IOI 2020', 'day1', 'IOI', 2020, 2, 'day1', 1),
            ('IOI 2020', 'day2', 'IOI', 2020, 3, 'day2', 0),
            ('IOI 2021', 'day1', 'IOI', 2021, 1, 'day1', 0),
            ('IOI 2021', 'day1', 'IOI', 2021, 2, 'day1', 1),
            ('USACO US Open 2023', 'bronze', 'USACO', 2023, 1, 'bronze', 0),
        ]
        c.executemany('INSERT INTO contest_problems (contest_name, contest_stage, problem_source, problem_year, problem_number, problem_extra, problem_index) VALUES (?, ?, ?, ?, ?, ?, ?)', contest_problems_data)
        
        # 12. user_virtual_contests table
        virtual_contests_data = [
            (1, 'IOI 2020', 'day1', '2023-01-01 10:00:00', '2023-01-01 15:00:00', 150.0, '100,50'),
            (2, 'IOI 2020', 'day1', '2023-01-02 10:00:00', '2023-01-02 15:00:00', 200.0, '100,100'),
            (1, 'IOI 2021', 'day1', '2023-01-03 10:00:00', '2023-01-03 15:00:00', 50.0, '50,0'),
        ]
        c.executemany('INSERT INTO user_virtual_contests (user_id, contest_name, contest_stage, started_at, ended_at, score, per_problem_scores) VALUES (?, ?, ?, ?, ?, ?, ?)', virtual_contests_data)
        
        # 13. user_virtual_submissions table
        submissions_data = [
            (1, 'IOI 2020', 'day1', '2023-01-01 10:30:00', 0, 100.0, '100'),
            (1, 'IOI 2020', 'day1', '2023-01-01 11:00:00', 1, 50.0, '50'),
            (2, 'IOI 2020', 'day1', '2023-01-02 10:45:00', 0, 100.0, '100'),
            (2, 'IOI 2020', 'day1', '2023-01-02 11:30:00', 1, 100.0, '100'),
        ]
        c.executemany('INSERT INTO user_virtual_submissions (user_id, contest_name, contest_stage, submission_time, problem_index, score, subtask_scores) VALUES (?, ?, ?, ?, ?, ?, ?)', submissions_data)
        
        # 14. active_virtual_contests table
        active_contests_data = [
            (3, 'IOI 2021', 'day1', '2023-01-04 10:00:00', '2023-01-04 15:00:00', 0, 0.0, '0,0'),
        ]
        c.executemany('INSERT INTO active_virtual_contests (user_id, contest_name, contest_stage, start_time, end_time, autosynced, score, per_problem_scores) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', active_contests_data)
        
        # 15. scraper_auth_tokens table
        scraper_data = [
            ('codeforces', 'cf_token_' + generate_random_string(20)),
            ('atcoder', 'ac_token_' + generate_random_string(20)),
        ]
        c.executemany('INSERT INTO scraper_auth_tokens (platform, token) VALUES (?, ?)', scraper_data)
        
        conn.commit()
        
        # Print summary
        print("✓ Created dummy data for all 15 tables:")
        for table in ['users', 'auth_identities', 'user_settings', 'sessions', 'problems', 
                     'problem_links', 'problem_statuses', 'user_problem_notes', 'contests',
                     'contest_scores', 'contest_problems', 'user_virtual_contests', 
                     'user_virtual_submissions', 'active_virtual_contests', 'scraper_auth_tokens']:
            c.execute(f"SELECT COUNT(*) FROM {table}")
            count = c.fetchone()[0]
            print(f"  {table}: {count} rows")
        
    finally:
        conn.close()

def test_migration(sqlite_db: str, postgres_url: str):
    """Test the migration script"""
    print(f"\nTesting migration from {sqlite_db} to {postgres_url}")
    
    # Run migration script
    migration_script = os.path.join(os.path.dirname(__file__), 'migrate_sqlite_to_postgres.py')
    
    # First try a dry run
    print("Running dry-run migration...")
    result = subprocess.run([
        sys.executable, migration_script,
        '--sqlite', sqlite_db,
        '--postgres', postgres_url,
        '--dry-run'
    ], capture_output=True, text=True)
    
    if result.returncode != 0:
        print(f"Dry-run failed: {result.stderr}")
        return False
        
    print(result.stdout)
    
    # Now run actual migration
    print("Running actual migration...")
    result = subprocess.run([
        sys.executable, migration_script,
        '--sqlite', sqlite_db,
        '--postgres', postgres_url
    ], capture_output=True, text=True)
    
    if result.returncode != 0:
        print(f"Migration failed: {result.stderr}")
        return False
        
    print(result.stdout)
    return True

def main():
    parser = argparse.ArgumentParser(description='Test SQLite to PostgreSQL migration')
    parser.add_argument('--test-db', default='test_migration.db', help='SQLite test database path')
    parser.add_argument('--postgres-url', help='PostgreSQL connection URL for testing')
    parser.add_argument('--skip-postgres-test', action='store_true', help='Skip PostgreSQL migration test')
    
    args = parser.parse_args()
    
    # Create test SQLite database
    test_db_path = os.path.abspath(args.test_db)
    
    # Remove existing test database
    if os.path.exists(test_db_path):
        os.remove(test_db_path)
    
    create_test_sqlite_db(test_db_path)
    
    print(f"\n✓ Test SQLite database created: {test_db_path}")
    
    if not args.skip_postgres_test and args.postgres_url:
        # Test migration
        success = test_migration(test_db_path, args.postgres_url)
        if success:
            print("\n✅ Migration test PASSED!")
            return 0
        else:
            print("\n❌ Migration test FAILED!")
            return 1
    else:
        print("\nSkipping PostgreSQL migration test (use --postgres-url to test)")
        print("You can manually test migration with:")
        print(f"python3 {os.path.join(os.path.dirname(__file__), 'migrate_sqlite_to_postgres.py')} --sqlite {test_db_path} --postgres 'your_postgres_url'")
        return 0

if __name__ == '__main__':
    sys.exit(main())