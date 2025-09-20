import { db } from './db-simple';

export function initDatabase() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      
      CREATE TABLE IF NOT EXISTS user_settings (
        user_id INTEGER PRIMARY KEY,
        checklist_public BOOLEAN DEFAULT FALSE,
        asc_sort BOOLEAN DEFAULT FALSE,
        dark_mode BOOLEAN DEFAULT FALSE,
        olympiad_order TEXT,
        platform_pref TEXT,
        hidden_olympiads TEXT,
        platform_usernames TEXT,
        local_storage TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      
      CREATE TABLE IF NOT EXISTS problems (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        number INTEGER,
        source TEXT,
        year INTEGER,
        extra TEXT
      );
      
      CREATE TABLE IF NOT EXISTS problem_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        problem_id INTEGER NOT NULL,
        platform TEXT NOT NULL,
        url TEXT NOT NULL,
        FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE
      );
      
      CREATE TABLE IF NOT EXISTS problem_statuses (
        user_id INTEGER NOT NULL,
        problem_name TEXT NOT NULL,
        source TEXT NOT NULL,
        year INTEGER NOT NULL,
        status INTEGER DEFAULT 0,
        score REAL DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, problem_name, source, year),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      
      CREATE TABLE IF NOT EXISTS user_problem_notes (
        user_id INTEGER NOT NULL,
        problem_name TEXT NOT NULL,
        source TEXT NOT NULL,
        year INTEGER NOT NULL,
        note TEXT DEFAULT '',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, problem_name, source, year),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_problems_source_year ON problems(source, year);
      CREATE INDEX IF NOT EXISTS idx_problem_links_problem_id ON problem_links(problem_id);
      CREATE INDEX IF NOT EXISTS idx_problem_statuses_user_source ON problem_statuses(user_id, source);
    `);
    
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
  }
}