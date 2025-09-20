import { FastifyInstance } from 'fastify';
import { data } from './data';
import { virtualContests } from './virtual-contests';
import { settings } from './settings';
import { scraping } from './scraping';

export async function api(app: FastifyInstance) {
  app.register(data);
  app.register(virtualContests);
  app.register(settings);
  app.register(scraping);
}