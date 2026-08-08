const db = require('../database');
const metricsService = require('./metricsService');

const MAX_ATTEMPTS = Math.max(1, Number(process.env.NOTIFICATION_MAX_ATTEMPTS || 5));
const LOCK_TIMEOUT_MS = Math.max(30_000, Number(process.env.NOTIFICATION_LOCK_TIMEOUT_MS || 300_000));
const RETENTION_DAYS = Math.max(1, Number(process.env.NOTIFICATION_RETENTION_DAYS || 90));
const EXTERNAL_CHANNELS = new Set(['email', 'push', 'whatsapp']);

function backoff(attempt) {
  return Math.min(60 * 60 * 1000, 1000 * (2 ** Math.max(0, attempt - 1)));
}

async function claimPending(limit = 50, database = db) {
  const now = new Date();
  const stale = new Date(now.getTime() - LOCK_TIMEOUT_MS).toISOString();
  return database.transaction(async trx => {
    await trx('notification_deliveries').where({ status: 'processing' }).where('locked_at', '<', stale)
      .update({ status: 'pending', locked_at: null, updated_at: trx.fn.now() });
    const candidates = await trx('notification_deliveries').where('status', 'pending').where('next_attempt_at', '<=', now.toISOString())
      .orderBy('id', 'asc').limit(Math.max(1, Math.min(Number(limit) || 50, 200)));
    const claimed = [];
    for (const candidate of candidates) {
      const count = await trx('notification_deliveries').where({ id: candidate.id, status: 'pending' })
        .update({ status: 'processing', locked_at: trx.fn.now(), updated_at: trx.fn.now() });
      if (count === 1) claimed.push({ ...candidate, status: 'processing' });
    }
    return claimed;
  });
}

async function markDelivered(id, database = db) {
  await database('notification_deliveries').where({ id, status: 'processing' })
    .update({ status: 'delivered', delivered_at: database.fn.now(), locked_at: null, updated_at: database.fn.now(), last_error: null });
  metricsService.increment('notification_delivery_total', { outcome: 'delivered' });
}

async function markBlocked(id, reason, database = db) {
  await database('notification_deliveries').where({ id, status: 'processing' })
    .update({ status: 'blocked', locked_at: null, last_error: reason.slice(0, 240), updated_at: database.fn.now() });
  metricsService.increment('notification_delivery_total', { outcome: 'blocked' });
}

async function markFailed(delivery, error, database = db) {
  const attempt = Number(delivery.attempt_count || 0) + 1;
  const terminal = attempt >= MAX_ATTEMPTS || !error.retryable;
  await database('notification_deliveries').where({ id: delivery.id, status: 'processing' }).update({
    status: terminal ? 'failed' : 'pending', attempt_count: attempt, locked_at: null,
    next_attempt_at: new Date(Date.now() + (terminal ? 0 : backoff(attempt))).toISOString(),
    last_error: String(error.message || 'Delivery failed').slice(0, 240), updated_at: database.fn.now()
  });
  metricsService.increment('notification_delivery_total', { outcome: terminal ? 'failed' : 'retry' });
}

async function processDelivery(delivery, { adapters = {}, database = db } = {}) {
  if (delivery.channel === 'in_app') return markDelivered(delivery.id, database);
  if (EXTERNAL_CHANNELS.has(delivery.channel) && typeof adapters[delivery.channel] !== 'function') {
    return markBlocked(delivery.id, 'provider_not_configured', database);
  }
  try {
    await adapters[delivery.channel](delivery);
    return markDelivered(delivery.id, database);
  } catch (error) {
    return markFailed(delivery, error, database);
  }
}

async function deliverPending({ limit = 50, adapters = {}, database = db } = {}) {
  const claimed = await claimPending(limit, database);
  for (const delivery of claimed) await processDelivery(delivery, { adapters, database });
  metricsService.add('notification_delivery_total', claimed.length, { outcome: 'claimed' });
  return { claimed: claimed.length };
}

async function pruneNotifications(database = db) {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const deleted = await database('notifications').where({ status: 'read' }).whereNotNull('read_at').where('read_at', '<', cutoff).del();
  if (deleted) metricsService.add('notification_delivery_total', deleted, { outcome: 'pruned' });
  return deleted;
}

module.exports = { LOCK_TIMEOUT_MS, MAX_ATTEMPTS, RETENTION_DAYS, claimPending, deliverPending, markBlocked, markDelivered, markFailed, processDelivery, pruneNotifications };
