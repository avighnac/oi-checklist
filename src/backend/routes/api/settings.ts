import createError from 'http-errors';
import { db } from '../../db-simple';
import { FastifyInstance } from 'fastify';
import { sessionRequired } from '../../middleware/auth';

interface SettingsSyncBody {
  local_storage?: string;
}

export async function settings(app: FastifyInstance) {
  app.addHook('preHandler', sessionRequired);

  app.post<{ Body: SettingsSyncBody }>('/settings/sync', async (req) => {
    const userId = req.userId!;
    const { local_storage } = req.body;
    
    if (local_storage !== undefined) {
      db.prepare(`
        INSERT INTO user_settings (user_id, local_storage) 
        VALUES (?, ?)
        ON CONFLICT(user_id) 
        DO UPDATE SET local_storage = excluded.local_storage
      `).run(userId, local_storage);
      
      return { success: true, message: 'Settings synced successfully.' };
    }
    
    throw new createError.BadRequest('No settings data provided.');
  });
}