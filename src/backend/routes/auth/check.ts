import createError from 'http-errors';
import { db, Session, User, Settings } from '../../db-simple';
import { FastifyInstance } from 'fastify';

interface CheckBody {
  token?: string;
}

interface UserSettingsQuery {
  username?: string;
}

export async function check(app: FastifyInstance) {
  app.post<{ Body: CheckBody }>('/check', async (req) => {
    const { token } = req.body;
    if (!token) {
      throw new createError.BadRequest('Missing token');
    }
    
    const session = db.prepare('SELECT user_id FROM sessions WHERE id = ?').get(token) as Session;
    if (!session) {
      throw new createError.Unauthorized('Invalid session');
    }
    
    const user = db.prepare('SELECT username FROM users WHERE id = ?').get(session.user_id) as User;
    const settings = db.prepare(`
      SELECT checklist_public, asc_sort, dark_mode, olympiad_order, 
             platform_pref, hidden_olympiads, platform_usernames, local_storage
      FROM user_settings WHERE user_id = ?
    `).get(session.user_id) as Settings;
    
    const settingsData = settings ? {
      checklistPublic: Boolean(settings.checklist_public),
      ascSort: Boolean(settings.asc_sort),
      darkMode: Boolean(settings.dark_mode),
      olympiadOrder: settings.olympiad_order ? JSON.parse(settings.olympiad_order) : null,
      platformPref: settings.platform_pref ? JSON.parse(settings.platform_pref) : null,
      hiddenOlympiads: settings.hidden_olympiads ? JSON.parse(settings.hidden_olympiads) : null,
      platformUsernames: settings.platform_usernames ? JSON.parse(settings.platform_usernames) : null,
      localStorage: settings.local_storage
    } : {
      checklistPublic: false,
      ascSort: false,
      darkMode: false,
      olympiadOrder: null,
      platformPref: null,
      hiddenOlympiads: null,
      platformUsernames: null,
      localStorage: null
    };
    
    return { 
      success: true, 
      username: user?.username,
      settings: settingsData
    };
  });

  app.get<{ Querystring: UserSettingsQuery }>('/check', async (req) => {
    const { username } = req.query;
    if (!username) {
      throw new createError.BadRequest('Missing username query parameter');
    }
    
    const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username) as User;
    if (!user) {
      throw new createError.NotFound(`User '${username}' not found`);
    }
    
    const settings = db.prepare(`
      SELECT olympiad_order, hidden_olympiads, asc_sort, platform_pref, platform_usernames
      FROM user_settings WHERE user_id = ?
    `).get(user.id) as Settings;
    
    if (!settings) {
      return {
        olympiadOrder: null,
        hidden: null,
        ascSort: null,
        platformPref: null,
        platformUsernames: null
      };
    }
    
    return {
      olympiadOrder: settings.olympiad_order ? JSON.parse(settings.olympiad_order) : null,
      hidden: settings.hidden_olympiads ? JSON.parse(settings.hidden_olympiads) : null,
      ascSort: Boolean(settings.asc_sort),
      platformPref: settings.platform_pref ? JSON.parse(settings.platform_pref) : null,
      platformUsernames: settings.platform_usernames ? JSON.parse(settings.platform_usernames) : null
    };
  });
}