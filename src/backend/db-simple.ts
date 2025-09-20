import Database from 'better-sqlite3';
import path from 'path';

const dbPath = process.env.DATABASE_PATH?.replace('file:', '') || './dev.db';
export const db = new Database(path.resolve(dbPath));
db.pragma('journal_mode = WAL');

export interface User {
  id: number;
  username: string;
  password?: string;
  created_at: string;
}

export interface Session {
  id: string;
  user_id: number;
  created_at: string;
}

export interface Settings {
  user_id: number;
  checklist_public: boolean;
  asc_sort: boolean;
  dark_mode: boolean;
  olympiad_order?: string;
  platform_pref?: string;
  hidden_olympiads?: string;
  platform_usernames?: string;
  local_storage?: string;
}

export interface Problem {
  id: number;
  name: string;
  number?: number;
  source?: string;
  year?: number;
  extra?: string;
}

export interface ProblemLink {
  id: number;
  problem_id: number;
  platform: string;
  url: string;
}

export interface ProblemStatus {
  user_id: number;
  problem_name: string;
  source: string;
  year: number;
  status: number;
  score: number;
  updated_at: string;
}

export interface UserProblemNote {
  user_id: number;
  problem_name: string;
  source: string;
  year: number;
  note: string;
  updated_at: string;
}

export interface Contest {
  id: number;
  name: string;
  stage?: string;
  source: string;
  year: number;
  duration_minutes?: number;
  location?: string;
  website?: string;
  link?: string;
  date?: string;
  notes?: string;
}

export interface ContestProblem {
  id: number;
  contest_name: string;
  contest_stage?: string;
  problem_source: string;
  problem_year: number;
  problem_name: string;
  problem_order: number;
}

export interface ActiveVirtualContest {
  user_id: number;
  contest_name: string;
  contest_stage?: string;
  start_time: string;
  end_time?: string;
  autosynced: boolean;
}

export interface UserVirtualContest {
  id: number;
  user_id: number;
  contest_name: string;
  contest_stage?: string;
  started_at: string;
  ended_at: string;
  score: number;
  per_problem_scores?: string;
}