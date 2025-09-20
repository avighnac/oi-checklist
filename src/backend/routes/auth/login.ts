import createError from "http-errors";
import crypto from 'crypto';
import { db, User, Settings } from '../../db-simple';
import { FastifyInstance } from 'fastify';

export async function login(app: FastifyInstance) {
  app.post<{ Body: { username: string, password: string } }>('/login', async (req) => {
    const { username, password } = req.body;
    if (!username || !password) {
      throw new createError.BadRequest('Missing username or password');
    }
    
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User;
    if (!user || crypto.createHash('sha256').update(password).digest('hex') !== user.password) {
      throw new createError.Unauthorized('Invalid username or password');
    }
    
    const sessionId = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (id, user_id) VALUES (?, ?)').run(sessionId, user.id);
    
    const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(user.id) as Settings;
    
    return { 
      token: sessionId, 
      settings: settings || {}, 
      username: user.username 
    };
  });
}