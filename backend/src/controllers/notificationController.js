const db = require('../database');
const { listPreferences, updatePreferences } = require('../services/notificationService');

async function getPreferences(req, res) {
  return res.json(await listPreferences(req.user.id));
}

async function putPreferences(req, res) {
  try {
    const preferences = await updatePreferences(req.user.id, req.body.preferences);
    return res.json(preferences);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

async function listNotifications(req, res) {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
  const rows = await db('notifications as n').leftJoin('notification_deliveries as d', 'd.notification_id', 'n.id').where('n.user_id', req.user.id)
    .select('n.id', 'n.event_type as eventType', 'n.channel', 'n.title', 'n.body', 'n.status', 'n.created_at as createdAt', 'n.read_at as readAt', 'd.status as deliveryStatus', 'd.attempt_count as deliveryAttempts', 'd.last_error as deliveryError')
    .orderBy('n.created_at', 'desc').limit(limit);
  const unread = await db('notifications').where({ user_id: req.user.id, status: 'unread' }).count('* as count').first();
  return res.json({ items: rows, unreadCount: Number(unread.count) });
}

async function markRead(req, res) {
  const updated = await db('notifications').where({ id: req.params.id, user_id: req.user.id, status: 'unread' }).update({ status: 'read', read_at: db.fn.now(), updated_at: db.fn.now() });
  return updated ? res.json({ message: 'Notification marked as read' }) : res.status(404).json({ error: 'Unread notification not found' });
}

module.exports = { getPreferences, putPreferences, listNotifications, markRead };
