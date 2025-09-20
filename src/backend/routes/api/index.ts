import { FastifyInstance } from 'fastify';
import { data } from './data';

export async function api(app: FastifyInstance) {
  app.register(data);
}