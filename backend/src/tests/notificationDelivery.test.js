process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-bytes';

const db = require('../database');
const { enqueueNotification, updatePreferences } = require('../services/notificationService');
const { deliverPending, pruneNotifications } = require('../services/notificationDeliveryService');

describe('notification delivery outbox', () => {
  let userId;

  beforeAll(async () => {
    await db.ready;
    [userId] = await db('users').insert({ name: 'Delivery User', email: `delivery-${Date.now()}@fitlife.com`, password_hash: 'not-used', role: 'personal' });
  });

  afterAll(async () => {
    if (userId) await db('users').where({ id: userId }).del();
    await db.destroy();
  });

  test('delivers in-app notifications once and remains idempotent', async () => {
    const [id] = await enqueueNotification({ userId, eventType: 'system', title: 'Aviso', body: 'Conteúdo', dedupeKey: `delivery-${Date.now()}` });
    expect(await deliverPending()).toEqual({ claimed: 1 });
    expect(await deliverPending()).toEqual({ claimed: 0 });
    expect(await db('notification_deliveries').where({ notification_id: id }).first()).toMatchObject({ status: 'delivered', attempt_count: 0 });
  });

  test('blocks an enabled external channel without retrying forever', async () => {
    await updatePreferences(userId, [{ eventType: 'system', channel: 'email', enabled: true }]);
    await enqueueNotification({ userId, eventType: 'system', title: 'E-mail', body: 'Pendente', dedupeKey: `external-${Date.now()}` });
    await deliverPending();
    expect(await db('notification_deliveries').where({ user_id: userId, channel: 'email' }).orderBy('id', 'desc').first()).toMatchObject({ status: 'blocked', last_error: 'provider_not_configured' });
  });

  test('retries transient adapter errors with bounded attempt state', async () => {
    await updatePreferences(userId, [{ eventType: 'system', channel: 'push', enabled: true }]);
    await enqueueNotification({ userId, eventType: 'system', title: 'Push', body: 'Retentar', dedupeKey: `retry-${Date.now()}` });
    await deliverPending({ adapters: { push: async () => { throw Object.assign(new Error('temporary provider error'), { retryable: true }); } } });
    expect(await db('notification_deliveries').where({ user_id: userId, channel: 'push' }).orderBy('id', 'desc').first()).toMatchObject({ status: 'pending', attempt_count: 1 });
  });

  test('prunes only old read notifications', async () => {
    const [id] = await db('notifications').insert({ user_id: userId, event_type: 'system', channel: 'in_app', title: 'Antiga', body: 'Apagar', status: 'read', read_at: '2020-01-01T00:00:00.000Z' });
    await db('notification_deliveries').insert({ notification_id: id, user_id: userId, channel: 'in_app', status: 'delivered', delivered_at: '2020-01-01T00:00:00.000Z' });
    expect(await pruneNotifications()).toBe(1);
    expect(await db('notifications').where({ id }).first()).toBeUndefined();
  });
});
