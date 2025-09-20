import { FastifyInstance } from 'fastify';
import { sessionRequired } from '../../middleware/auth';

export async function oauth(app: FastifyInstance) {
  // GitHub OAuth routes
  app.get('/github/start', async (req, reply) => {
    // TODO: Implement GitHub OAuth start
    return reply.code(501).send({ error: 'GitHub OAuth not yet implemented in TypeScript backend' });
  });

  app.get('/github/link', async (req, reply) => {
    // TODO: Implement GitHub OAuth link
    return reply.code(501).send({ error: 'GitHub OAuth linking not yet implemented' });
  });

  app.get('/github/callback', async (req, reply) => {
    // TODO: Implement GitHub OAuth callback
    return reply.code(501).send({ error: 'GitHub OAuth callback not yet implemented' });
  });

  app.get('/github/status', { preHandler: sessionRequired }, async (req) => {
    // TODO: Implement GitHub OAuth status check
    return { error: 'GitHub OAuth status not yet implemented' };
  });

  app.post('/github/unlink', { preHandler: sessionRequired }, async (req) => {
    // TODO: Implement GitHub OAuth unlink
    return { error: 'GitHub OAuth unlink not yet implemented' };
  });

  // Discord OAuth routes
  app.get('/discord/start', async (req, reply) => {
    return reply.code(501).send({ error: 'Discord OAuth not yet implemented in TypeScript backend' });
  });

  app.get('/discord/link', async (req, reply) => {
    return reply.code(501).send({ error: 'Discord OAuth linking not yet implemented' });
  });

  app.get('/discord/callback', async (req, reply) => {
    return reply.code(501).send({ error: 'Discord OAuth callback not yet implemented' });
  });

  app.get('/discord/status', { preHandler: sessionRequired }, async (req) => {
    return { error: 'Discord OAuth status not yet implemented' };
  });

  app.post('/discord/unlink', { preHandler: sessionRequired }, async (req) => {
    return { error: 'Discord OAuth unlink not yet implemented' };
  });

  // Google OAuth routes
  app.get('/google/start', async (req, reply) => {
    return reply.code(501).send({ error: 'Google OAuth not yet implemented in TypeScript backend' });
  });

  app.get('/google/link', async (req, reply) => {
    return reply.code(501).send({ error: 'Google OAuth linking not yet implemented' });
  });

  app.get('/google/callback', async (req, reply) => {
    return reply.code(501).send({ error: 'Google OAuth callback not yet implemented' });
  });

  app.get('/google/status', { preHandler: sessionRequired }, async (req) => {
    return { error: 'Google OAuth status not yet implemented' };
  });

  app.post('/google/unlink', { preHandler: sessionRequired }, async (req) => {
    return { error: 'Google OAuth unlink not yet implemented' };
  });
}