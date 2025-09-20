import createError from 'http-errors';
import { FastifyInstance } from 'fastify';
import { sessionRequired } from '../../middleware/auth';

const SCRAPING_SERVER_URL = process.env.SCRAPING_SERVER_URL || 'http://localhost:5502';

interface ScrapingBody {
  [key: string]: any;
}

async function callScrapingServer(endpoint: string, userId: number, data: any) {
  try {
    const response = await fetch(`${SCRAPING_SERVER_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userId,
        ...data
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new createError.BadGateway(`Scraping server error: ${errorData.error || response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    if (error.name === 'FetchError' || error.code === 'ECONNREFUSED') {
      throw new createError.ServiceUnavailable('Scraping server is not available');
    }
    throw error;
  }
}

export async function scraping(app: FastifyInstance) {
  app.addHook('preHandler', sessionRequired);

  app.post<{ Body: ScrapingBody }>('/verify-ojuz', async (req) => {
    const userId = req.userId!;
    return await callScrapingServer('/verify-ojuz', userId, req.body);
  });

  app.post<{ Body: ScrapingBody }>('/update-ojuz', async (req) => {
    const userId = req.userId!;
    return await callScrapingServer('/update-ojuz', userId, req.body);
  });

  app.post<{ Body: ScrapingBody }>('/verify-qoj', async (req) => {
    const userId = req.userId!;
    return await callScrapingServer('/verify-qoj', userId, req.body);
  });

  app.post<{ Body: ScrapingBody }>('/update-qoj', async (req) => {
    const userId = req.userId!;
    return await callScrapingServer('/update-qoj', userId, req.body);
  });
}