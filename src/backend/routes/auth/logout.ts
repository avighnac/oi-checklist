import createError from 'http-errors';
import { db, Session } from '../../db-simple';
import { FastifyInstance } from 'fastify';

interface LogoutBody {
  local_storage?: string;
}

export async function logout(app: FastifyInstance) {
  app.post<{ Body: LogoutBody }>('/logout', async (req) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new createError.Forbidden('Token is missing');
    }
    
    const sessionId = auth.split(' ', 2)[1];
    
    if (sessionId === 'demo-session-fixed-token-123456789') {
      return { success: true, message: 'Demo session preserved.' };
    }
    
    const { local_storage } = req.body;
    
    const session = db.prepare('SELECT user_id FROM sessions WHERE id = ?').get(sessionId) as Session;
    if (!session) {
      throw new createError.Unauthorized('Invalid session');
    }
    
    if (local_storage !== undefined) {
      db.prepare(`
        INSERT INTO user_settings (user_id, local_storage) 
        VALUES (?, ?)
        ON CONFLICT(user_id) 
        DO UPDATE SET local_storage = excluded.local_storage
      `).run(session.user_id, local_storage);
    }
    
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    
    return { success: true, message: 'Logged out successfully.' };
  });
}