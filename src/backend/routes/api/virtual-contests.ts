import createError from 'http-errors';
import { db, Contest, ContestProblem, ActiveVirtualContest, UserVirtualContest } from '../../db-simple';
import { FastifyInstance } from 'fastify';
import { sessionRequired } from '../../middleware/auth';

interface StartContestBody {
  contest_name?: string;
  contest_stage?: string;
}

interface EndContestBody {
  contest_name?: string;
  contest_stage?: string;
}

export async function virtualContests(app: FastifyInstance) {
  app.addHook('preHandler', sessionRequired);

  app.get('/virtual-contests', async (req) => {
    const userId = req.userId!;
    
    const activeContest = db.prepare(`
      SELECT 
        avc.contest_name,
        avc.contest_stage,
        avc.start_time,
        avc.end_time,
        avc.autosynced,
        c.duration_minutes,
        c.location,
        c.website,
        c.link
      FROM active_virtual_contests avc
      JOIN contests c ON avc.contest_name = c.name AND 
        (avc.contest_stage = c.stage OR (avc.contest_stage IS NULL AND c.stage IS NULL))
      WHERE avc.user_id = ?
    `).get(userId) as ActiveVirtualContest & Contest;
    
    const contests = db.prepare(`
      SELECT 
        name, stage, source, year, duration_minutes,
        COALESCE(location, '') as location,
        COALESCE(website, '') as website,
        COALESCE(link, '') as link,
        COALESCE(date, '') as date,
        COALESCE(notes, '') as notes
      FROM contests 
      ORDER BY year DESC, source, stage
    `).all() as Contest[];
    
    const contestProblems = db.prepare(`
      SELECT 
        cp.contest_name,
        cp.contest_stage,
        cp.problem_source,
        cp.problem_year,
        cp.problem_name,
        cp.problem_order
      FROM contest_problems cp
      ORDER BY cp.contest_name, cp.contest_stage, cp.problem_order
    `).all() as ContestProblem[];
    
    const contestsWithProblems = contests.map(contest => {
      const problems = contestProblems.filter(cp => 
        cp.contest_name === contest.name && 
        (cp.contest_stage === contest.stage || (!cp.contest_stage && !contest.stage))
      );
      
      return {
        ...contest,
        problems: problems.map(p => ({
          source: p.problem_source,
          year: p.problem_year,
          name: p.problem_name,
          order: p.problem_order
        }))
      };
    });
    
    return {
      active_contest: activeContest || null,
      contests: contestsWithProblems
    };
  });

  app.get('/virtual-contests/history', async (req) => {
    const userId = req.userId!;
    
    const history = db.prepare(`
      SELECT 
        contest_name,
        contest_stage,
        started_at,
        ended_at,
        score,
        per_problem_scores
      FROM user_virtual_contests
      WHERE user_id = ?
      ORDER BY started_at DESC
    `).all(userId) as UserVirtualContest[];
    
    const historyWithDetails = history.map(h => ({
      ...h,
      per_problem_scores: h.per_problem_scores ? JSON.parse(h.per_problem_scores) : null
    }));
    
    return { history: historyWithDetails };
  });

  app.post<{ Body: StartContestBody }>('/virtual-contests/start', async (req) => {
    const userId = req.userId!;
    const { contest_name, contest_stage } = req.body;
    
    if (!contest_name) {
      throw new createError.BadRequest('Missing contest_name');
    }
    
    const existingActive = db.prepare('SELECT user_id FROM active_virtual_contests WHERE user_id = ?').get(userId);
    if (existingActive) {
      throw new createError.Conflict('User already has an active virtual contest');
    }
    
    const contest = db.prepare(`
      SELECT duration_minutes FROM contests 
      WHERE name = ? AND (stage = ? OR (stage IS NULL AND ? IS NULL))
    `).get(contest_name, contest_stage || null, contest_stage || null) as Contest;
    
    if (!contest) {
      throw new createError.NotFound('Contest not found');
    }
    
    const startTime = new Date().toISOString();
    const endTime = contest.duration_minutes 
      ? new Date(Date.now() + contest.duration_minutes * 60 * 1000).toISOString()
      : null;
    
    db.prepare(`
      INSERT INTO active_virtual_contests (user_id, contest_name, contest_stage, start_time, end_time)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, contest_name, contest_stage || null, startTime, endTime);
    
    return { 
      success: true, 
      start_time: startTime,
      end_time: endTime
    };
  });

  app.post<{ Body: EndContestBody }>('/virtual-contests/end', async (req) => {
    const userId = req.userId!;
    
    const activeContest = db.prepare(`
      SELECT contest_name, contest_stage, start_time, end_time
      FROM active_virtual_contests 
      WHERE user_id = ?
    `).get(userId) as ActiveVirtualContest;
    
    if (!activeContest) {
      throw new createError.NotFound('No active virtual contest found');
    }
    
    // TODO: Implement submission syncing and scoring logic here
    // For now, just return basic structure
    
    return {
      success: true,
      contest_name: activeContest.contest_name,
      contest_stage: activeContest.contest_stage,
      message: 'Contest ended, ready for scoring'
    };
  });

  app.post('/virtual-contests/confirm', async (req) => {
    const userId = req.userId!;
    
    const activeContest = db.prepare(`
      SELECT contest_name, contest_stage, start_time, end_time
      FROM active_virtual_contests 
      WHERE user_id = ?
    `).get(userId) as ActiveVirtualContest;
    
    if (!activeContest) {
      throw new createError.NotFound('No active virtual contest found');
    }
    
    // TODO: Calculate final scores
    const totalScore = 0;
    const perProblemScores = {};
    
    const endTime = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO user_virtual_contests 
      (user_id, contest_name, contest_stage, started_at, ended_at, score, per_problem_scores)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId, 
      activeContest.contest_name, 
      activeContest.contest_stage,
      activeContest.start_time,
      endTime,
      totalScore,
      JSON.stringify(perProblemScores)
    );
    
    db.prepare('DELETE FROM active_virtual_contests WHERE user_id = ?').run(userId);
    
    return { success: true };
  });

  app.post('/virtual-contests/submit', async (req) => {
    const userId = req.userId!;
    
    const activeContest = db.prepare(`
      SELECT contest_name, contest_stage, start_time, end_time
      FROM active_virtual_contests 
      WHERE user_id = ?
    `).get(userId) as ActiveVirtualContest;
    
    if (!activeContest) {
      throw new createError.NotFound('No active virtual contest found');
    }
    
    // TODO: Calculate final scores and save submissions
    const totalScore = 0;
    const perProblemScores = {};
    
    const endTime = new Date().toISOString();
    
    db.prepare(`
      INSERT OR REPLACE INTO user_virtual_contests 
      (user_id, contest_name, contest_stage, started_at, ended_at, score, per_problem_scores)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId, 
      activeContest.contest_name, 
      activeContest.contest_stage,
      activeContest.start_time,
      endTime,
      totalScore,
      JSON.stringify(perProblemScores)
    );
    
    db.prepare('DELETE FROM active_virtual_contests WHERE user_id = ?').run(userId);
    
    return { success: true };
  });

  app.get<{ Params: { slug: string } }>('/virtual-contests/detail/:slug', async (req) => {
    const { slug } = req.params;
    
    // TODO: Implement contest detail retrieval by slug
    // For now, return basic structure
    
    return {
      contest: {
        name: slug,
        details: 'Contest details would be here'
      }
    };
  });
}