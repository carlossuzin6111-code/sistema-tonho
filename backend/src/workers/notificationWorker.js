const db = require('../database');
const { deliverPending, pruneNotifications } = require('../services/notificationDeliveryService');
const metrics = require('../services/metricsService');

const POLL_INTERVAL_MS = Math.max(1000, Number(process.env.NOTIFICATION_POLL_INTERVAL_MS || 5000));

async function runNotificationCycle() {
  try {
    const result = await deliverPending({ limit: 50 });
    const pruned = await pruneNotifications();
    metrics.increment('notification_worker_cycles_total', { outcome: 'success' });
    return { ...result, pruned };
  } catch (error) {
    metrics.increment('notification_worker_cycles_total', { outcome: 'error' });
    throw error;
  }
}

async function run() {
  await db.ready;
  await runNotificationCycle();
  setInterval(() => runNotificationCycle().catch(error => console.error('[Notifications] cycle failed:', error.message)), POLL_INTERVAL_MS);
}

if (require.main === module) run().catch(error => { console.error('[Notifications] worker failed:', error); process.exitCode = 1; });

module.exports = { POLL_INTERVAL_MS, runNotificationCycle };
