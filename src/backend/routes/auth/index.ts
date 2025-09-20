import { FastifyInstance } from 'fastify';
import { register } from './register';
import { login } from './login';
import { check } from './check';
import { logout } from './logout';
import { demoLogin } from './demo-login';
import { oauth } from './oauth';

export async function auth(app: FastifyInstance) {
  app.register(register);
  app.register(login);
  app.register(check);
  app.register(logout);
  app.register(demoLogin);
  app.register(oauth);
}