const db = require('../database');

const CHANNELS = new Set(['in_app', 'email', 'push', 'whatsapp']);
const DEFAULT_EVENT_TYPES = ['workout_reminder', 'nps_survey', 'churn_alert', 'system'];

async function listPreferences(userId, database = db) {
  const rows = await database('notification_preferences').where({ user_id: userId }).select('event_type as eventType', 'channel', 'enabled').orderBy(['event_type', 'channel']);
  return rows.map(row => ({ ...row, enabled: Boolean(row.enabled) }));
}

async function updatePreferences(userId, preferences, database = db) {
  if (!Array.isArray(preferences) || preferences.length > 100) throw new Error('Invalid notification preferences');
  const normalized = preferences.map(item => ({ event_type: String(item.eventType || ''), channel: String(item.channel || ''), enabled: Boolean(item.enabled) }));
  if (normalized.some(item => !DEFAULT_EVENT_TYPES.includes(item.event_type) || !CHANNELS.has(item.channel))) throw new Error('Invalid notification preference');
  await database.transaction(async trx => {
    for (const item of normalized) {
      const existing = await trx('notification_preferences').where({ user_id: userId, event_type: item.event_type, channel: item.channel }).first();
      if (existing) await trx('notification_preferences').where({ id: existing.id }).update({ enabled: item.enabled, updated_at: trx.fn.now() });
      else await trx('notification_preferences').insert({ user_id: userId, ...item });
    }
  });
  return listPreferences(userId, database);
}

async function isEnabled(userId, eventType, channel, database = db) {
  const preference = await database('notification_preferences').where({ user_id: userId, event_type: eventType, channel }).first();
  if (preference) return Boolean(preference.enabled);
  return channel === 'in_app';
}

async function enqueueNotification({ userId, eventType, title, body, dedupeKey = null }, database = db) {
  const inserted = [];
  await database.transaction(async trx => {
    for (const channel of CHANNELS) {
      if (!(await isEnabled(userId, eventType, channel, trx))) continue;
      const existing = dedupeKey == null ? null : await trx('notifications').where({ user_id: userId, channel, dedupe_key: dedupeKey }).first();
      if (existing) {
        inserted.push(existing.id);
        await trx('notification_deliveries').insert({ notification_id: existing.id, user_id: userId, channel }).onConflict('notification_id').ignore();
        continue;
      }
      const [id] = await trx('notifications').insert({ user_id: userId, event_type: eventType, channel, title: String(title).slice(0, 180), body: String(body), status: 'unread', dedupe_key: dedupeKey });
      await trx('notification_deliveries').insert({ notification_id: id, user_id: userId, channel });
      inserted.push(id);
    }
  });
  return inserted;
}

module.exports = { CHANNELS, DEFAULT_EVENT_TYPES, listPreferences, updatePreferences, enqueueNotification };
