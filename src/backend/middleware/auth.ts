import { FastifyRequest, FastifyReply } from 'fastify';
import createError from 'http-errors';
import { db, Session } from '../db-simple';

declare module 'fastify' {
  interface FastifyRequest {
    userId?: number;
  }
}

export async function sessionRequired(req: FastifyRequest, reply: FastifyReply) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    throw new createError.Forbidden('Token is missing');
  }
  
  const token = auth.split(' ', 2)[1];
  const session = db.prepare('SELECT user_id FROM sessions WHERE id = ?').get(token) as Session;
  
  if (!session) {
    throw new createError.Unauthorized('Invalid or expired session');
  }
  
  req.userId = session.user_id;
}

export async function optionalSession(req: FastifyRequest, reply: FastifyReply) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    const token = auth.split(' ', 2)[1];
    const session = db.prepare('SELECT user_id FROM sessions WHERE id = ?').get(token) as Session;
    
    if (session) {
      req.userId = session.user_id;
    }
  }
}