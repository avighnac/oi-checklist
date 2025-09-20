import createError from 'http-errors';
import crypto from 'crypto';
import { db } from '../../db-simple';
import { FastifyInstance } from 'fastify';

export async function register(app: FastifyInstance) {
  app.post<{ Body: { username: string; password: string } }>('/register', async (req) => {
    const { username, password } = req.body;
    if (!username || !password) {
      throw new createError.BadRequest('Missing username or password');
    }
    
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existingUser) {
      throw new createError.Conflict('Username taken');
    }
    
    db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(
      username,
      crypto.createHash('sha256').update(password).digest('hex')
    );
    
    return { success: true };
  });
}