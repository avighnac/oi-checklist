import { Mutex } from 'async-mutex';
import { spawn } from 'child_process';
import path from 'path';
import { root, QojUsers, QojPasses } from '@config';
import { Prisma, UserProblemData, VirtualSubmission } from '@prisma/client';
import { db } from '@db';

const tokenLocks = new Map<string, Mutex>();

function getTokenLock(username: string): Mutex {
  let lock = tokenLocks.get(username);
  if (!lock) {
    lock = new Mutex();
    tokenLocks.set(username, lock);
  }
  return lock;
}

async function getValidSession(username: string, password: string, oldSession: string): Promise<{ session?: string, error?: string }> {
  return getTokenLock(username).runExclusive(async () => {
    return new Promise<{ session?: string, error?: string }>((res) => {
      const proc = spawn('python3',
        [path.resolve(root, 'src/backend/python/qoj/refresh.py')],
        { stdio: ['pipe', 'pipe', 'pipe'] }
      );
      proc.stdin.write(JSON.stringify({ oldSession, username, password }));
      proc.stdin.end();
      let out = '';
      proc.stdout.on('data', d => out += d.toString());
      proc.on('close', () => {
        const json = JSON.parse(out);
        res({ session: json.session ?? null, error: json.error ?? null });
      });
    });
  });
}

async function getAllValidSessions(): Promise<string[]> {
  return Promise.all(QojUsers.map(async (username, i) => {
    const password = QojPasses[i];
    const existing = await db.scraperAuthToken.findUnique({
      where: { platform_username: { platform: 'qoj.ac', username } }
    });
    const res = await getValidSession(username, password, existing?.token ?? '');
    if (res.error || !res.session) {
      throw new Error(res.error ?? `Failed to obtain a session for qoj.ac account "${username}"`);
    }
    await db.scraperAuthToken.upsert({
      where: { platform_username: { platform: 'qoj.ac', username } },
      update: { token: res.session },
      create: { platform: 'qoj.ac', username, token: res.session }
    });
    return res.session;
  }));
}

export const qoj = {
  async verify(cookie: string) {
    return new Promise<{ error?: string, username?: string }>(res => {
      const proc = spawn('python3',
        [path.resolve(root, 'src/backend/python/qoj/verify.py')],
        { stdio: ['pipe', 'pipe', 'pipe'] }
      );
      proc.stdin.write(JSON.stringify({ session: cookie }));
      proc.stdin.end();
      let out = '';
      proc.stdout.on('data', d => out += d.toString());
      proc.on('close', () => {
        const json = JSON.parse(out);
        res({ username: json.username ?? null, error: json.error ?? null })
      });
    });
  },

  async fetchProblemScores(cookie: string, username: string, problems: Prisma.ProblemGetPayload<{ include: { problemLinks: true } }>[]) {
    return new Promise<{ error?: string, scores?: UserProblemData[] }>(res => {
      const proc = spawn('python3',
        [path.resolve(root, 'src/backend/python/qoj/fetchProblemScores.py')],
        { stdio: ['pipe', 'pipe', 'pipe'] }
      );
      proc.stdin.write(JSON.stringify({ cookie, username, problems }));
      proc.stdin.end();
      let out = '';
      proc.stdout.on('data', d => out += d.toString());
      proc.on('close', () => {
        const json = JSON.parse(out);
        res({ scores: json.scores ?? null, error: json.error ?? null });
      });
    });
  },

  async fetchContestScores(username: string, contest: Prisma.ActiveVirtualContestGetPayload<{
    include: {
      contest: {
        include: {
          problems: {
            include: {
              problem: {
                include: { problemLinks: true }
              }
            }
          }
        }
      }
    }
  }>) {
    const sessions = await getAllValidSessions();
    return new Promise<{ error?: string, submissions?: VirtualSubmission[] }>(res => {
      const proc = spawn('python3',
        [path.resolve(root, 'src/backend/python/qoj/fetchContestScores.py')],
        { stdio: ['pipe', 'pipe', 'pipe'] }
      );
      proc.stdin.write(JSON.stringify({ sessions, username, contest }));
      proc.stdin.end();
      let out = '';
      proc.stdout.on('data', d => out += d.toString());
      proc.on('close', () => {
        const json = JSON.parse(out);
        res({ submissions: json.submissions ?? null, error: json.error ?? null });
      });
    });
  }
};