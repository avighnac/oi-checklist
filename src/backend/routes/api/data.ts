import createError from 'http-errors';
import { db, User, Settings, Problem, ProblemLink, ProblemStatus, UserProblemNote } from '../../db-simple';
import { FastifyInstance } from 'fastify';
import { sessionRequired, optionalSession } from '../../middleware/auth';

interface ProblemsQuery {
  names?: string;
  username?: string;
  problems?: string;
}

interface NoteQuery {
  problem_name?: string;
  source?: string;
  year?: number;
}

interface NoteBody {
  problem_name?: string;
  source?: string;
  year?: number;
  note?: string;
}

interface ProblemUpdateBody {
  problem_name?: string;
  source?: string;
  year?: number;
  status?: number;
  score?: number;
}

function chooseLink(links: Array<{platform: string, url: string}>, platformPref?: any): string {
  if (!links.length) return '';
  
  if (platformPref) {
    const prefs = Array.isArray(platformPref) ? platformPref : [platformPref];
    for (const plat of prefs) {
      const link = links.find(l => l.platform === plat);
      if (link) return link.url;
    }
  }
  
  const order = ['oj.uz', 'qoj.ac'];
  for (const plat of order) {
    const link = links.find(l => l.platform === plat);
    if (link) return link.url;
  }
  
  return links[0].url;
}

export async function data(app: FastifyInstance) {
  app.addHook('preHandler', optionalSession);

  app.get<{ Querystring: ProblemsQuery }>('/data', async (req) => {
    const { names, username, problems } = req.query;
    
    if (username) {
      const problemsList = problems ? problems.split(',').map(p => p.trim()) : [];
      
      const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username) as User;
      if (!user) {
        throw new createError.NotFound(`User ${username} not found`);
      }
      
      const settings = db.prepare('SELECT checklist_public, platform_pref FROM user_settings WHERE user_id = ?').get(user.id) as Settings;
      const checklistPublic = settings?.checklist_public || false;
      
      if (!checklistPublic) {
        throw new createError.Forbidden(`${username}'s checklist is private`);
      }
      
      let problemsByCategory: any = {};
      
      if (problemsList.length) {
        const placeholders = problemsList.map(() => '?').join(', ');
        const problemsRaw = db.prepare(`
          SELECT *, COALESCE(number, 0) as number 
          FROM problems 
          WHERE source IN (${placeholders}) 
          ORDER BY source, year, number
        `).all(...problemsList) as Problem[];
        
        const problemIds = problemsRaw.map(row => row.id);
        const linksById: { [key: number]: Array<{platform: string, url: string}> } = {};
        
        if (problemIds.length) {
          const linkPlaceholders = problemIds.map(() => '?').join(', ');
          const linkRows = db.prepare(`
            SELECT problem_id, platform, url 
            FROM problem_links 
            WHERE problem_id IN (${linkPlaceholders})
          `).all(...problemIds) as ProblemLink[];
          
          for (const lr of linkRows) {
            if (!linksById[lr.problem_id]) linksById[lr.problem_id] = [];
            linksById[lr.problem_id].push({ platform: lr.platform, url: lr.url });
          }
        }
        
        const progressRows = db.prepare(`
          SELECT problem_name, source, year, status, score
          FROM problem_statuses 
          WHERE user_id = ? AND source IN (${placeholders})
        `).all(user.id, ...problemsList) as ProblemStatus[];
        
        const progress: { [key: string]: {status: number, score: number} } = {};
        for (const row of progressRows) {
          const key = `${row.problem_name}|${row.source}|${row.year}`;
          progress[key] = { status: row.status, score: row.score };
        }
        
        const platformPref = settings?.platform_pref ? JSON.parse(settings.platform_pref) : null;
        
        for (const row of problemsRaw) {
          const problem: any = { ...row };
          delete problem.id;
          
          const links = linksById[row.id] || [];
          problem.link = chooseLink(links, platformPref);
          
          const key = `${problem.name}|${problem.source}|${problem.year}`;
          if (progress[key]) {
            problem.status = progress[key].status;
            problem.score = progress[key].score;
          } else {
            problem.status = 0;
            problem.score = 0;
          }
          
          if (!problemsByCategory[problem.source]) {
            problemsByCategory[problem.source] = {};
          }
          if (!problemsByCategory[problem.source][problem.year]) {
            problemsByCategory[problem.source][problem.year] = [];
          }
          problemsByCategory[problem.source][problem.year].push(problem);
        }
      }
      
      return {
        username,
        checklist_public: checklistPublic,
        problems: problemsByCategory
      };
    }
    
    if (!req.userId) {
      throw new createError.Unauthorized('Authentication required');
    }
    
    if (!names) {
      throw new createError.BadRequest('Missing names query parameter');
    }
    
    const namesList = names.split(',').map(n => n.trim());
    const userId = req.userId;
    
    const settings = db.prepare('SELECT platform_pref FROM user_settings WHERE user_id = ?').get(userId) as Settings;
    const platformPref = settings?.platform_pref ? JSON.parse(settings.platform_pref) : null;
    
    const wantAllLinks = String(req.headers['x-all-problem-links'] || '').toLowerCase() === 'true';
    
    const placeholders = namesList.map(() => '?').join(', ');
    const problemsRaw = db.prepare(`
      SELECT *, COALESCE(number, 0) as number 
      FROM problems 
      WHERE source IN (${placeholders}) 
      ORDER BY source, year, number
    `).all(...namesList) as Problem[];
    
    const problemIds = problemsRaw.map(row => row.id);
    const linksById: { [key: number]: Array<{platform: string, url: string}> } = {};
    
    if (problemIds.length) {
      const linkPlaceholders = problemIds.map(() => '?').join(', ');
      const linkRows = db.prepare(`
        SELECT problem_id, platform, url 
        FROM problem_links 
        WHERE problem_id IN (${linkPlaceholders})
      `).all(...problemIds) as ProblemLink[];
      
      for (const lr of linkRows) {
        if (!linksById[lr.problem_id]) linksById[lr.problem_id] = [];
        linksById[lr.problem_id].push({ platform: lr.platform, url: lr.url });
      }
    }
    
    const progressRows = db.prepare(`
      SELECT problem_name, source, year, status, score
      FROM problem_statuses 
      WHERE user_id = ? AND source IN (${placeholders})
    `).all(userId, ...namesList) as ProblemStatus[];
    
    const progress: { [key: string]: {status: number, score: number} } = {};
    for (const row of progressRows) {
      const key = `${row.problem_name}|${row.source}|${row.year}`;
      progress[key] = { status: row.status, score: row.score };
    }
    
    const problemsByCategory: any = {};
    
    for (const row of problemsRaw) {
      const problem: any = { ...row };
      delete problem.id;
      
      const links = linksById[row.id] || [];
      if (wantAllLinks) {
        problem.links = {};
        for (const l of links) {
          problem.links[l.platform] = l.url;
        }
      } else {
        problem.link = chooseLink(links, platformPref);
      }
      
      if (row.extra) {
        problem.extra = row.extra;
      }
      
      const key = `${problem.name}|${problem.source}|${problem.year}`;
      if (progress[key]) {
        problem.status = progress[key].status;
        problem.score = progress[key].score;
      } else {
        problem.status = 0;
        problem.score = 0;
      }
      
      if (!problemsByCategory[problem.source]) {
        problemsByCategory[problem.source] = {};
      }
      if (!problemsByCategory[problem.source][problem.year]) {
        problemsByCategory[problem.source][problem.year] = [];
      }
      problemsByCategory[problem.source][problem.year].push(problem);
    }
    
    return problemsByCategory;
  });

  app.get<{ Querystring: NoteQuery }>('/note', async (req) => {
    if (!req.userId) {
      throw new createError.Unauthorized('Authentication required');
    }
    
    const { problem_name, source, year } = req.query;
    if (!problem_name || !source || year === undefined) {
      throw new createError.BadRequest('Missing required parameters');
    }
    
    const note = db.prepare(`
      SELECT note FROM user_problem_notes 
      WHERE user_id = ? AND problem_name = ? AND source = ? AND year = ?
    `).get(req.userId, problem_name, source, year) as UserProblemNote;
    
    return { note: note?.note || '' };
  });

  app.post<{ Body: NoteBody }>('/note', async (req) => {
    if (!req.userId) {
      throw new createError.Unauthorized('Authentication required');
    }
    
    const { problem_name, source, year, note } = req.body;
    if (!problem_name || !source || year === undefined) {
      throw new createError.BadRequest('Missing required fields');
    }
    
    try {
      const yearInt = parseInt(String(year));
      if (isNaN(yearInt)) {
        throw new createError.BadRequest('Invalid year');
      }
      
      db.prepare(`
        INSERT INTO user_problem_notes (user_id, problem_name, source, year, note, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(user_id, problem_name, source, year)
        DO UPDATE SET note = excluded.note, updated_at = datetime('now')
      `).run(req.userId, problem_name, source, yearInt, note || '');
      
      return { success: true };
    } catch (error) {
      throw new createError.BadRequest('Invalid year');
    }
  });

  app.post<{ Body: ProblemUpdateBody }>('/problem-update', async (req) => {
    if (!req.userId) {
      throw new createError.Unauthorized('Authentication required');
    }
    
    const { problem_name, source, year, status, score } = req.body;
    if (!problem_name || !source || year === undefined) {
      throw new createError.BadRequest('Missing required fields');
    }
    
    if (status !== undefined) {
      db.prepare(`
        INSERT INTO problem_statuses (user_id, problem_name, source, year, status)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, problem_name, source, year)
        DO UPDATE SET status = excluded.status
      `).run(req.userId, problem_name, source, year, status);
    }
    
    if (score !== undefined) {
      db.prepare(`
        INSERT INTO problem_statuses (user_id, problem_name, source, year, score)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, problem_name, source, year)
        DO UPDATE SET score = excluded.score
      `).run(req.userId, problem_name, source, year, score);
    }
    
    return { success: true };
  });
}