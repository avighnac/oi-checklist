import { FastifyInstance } from 'fastify';

export async function demoLogin(app: FastifyInstance) {
  app.post('/demo-login', async () => {
    return {
      success: true,
      token: 'demo-session-fixed-token-123456789',
      username: 'demo_user'
    };
  });
}