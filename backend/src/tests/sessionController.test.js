process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-bytes';

const bcrypt = require('bcryptjs');
const request = require('supertest');
const app = require('../index');
const db = require('../database');

function cookieHeader(response) {
  return (response.headers['set-cookie'] || []).map(cookie => cookie.split(';', 1)[0]).join('; ');
}

function cookieValue(response, name) {
  const cookie = (response.headers['set-cookie'] || []).find(value => value.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.split(';', 1)[0].slice(name.length + 1)) : '';
}

describe('device sessions', () => {
  let userId;
  let email;
  const password = 'DevicePassword123!';

  beforeAll(async () => {
    await db.ready;
    email = `session-${Date.now()}@fitlife.com`;
    [userId] = await db('users').insert({ name: 'Session User', email, password_hash: await bcrypt.hash(password, 10), role: 'personal' });
  });

  afterAll(async () => {
    if (userId) await db('users').where({ id: userId }).del();
    await db.destroy();
  });

  test('supports per-device revocation', async () => {
    const user = await db('users').where({ id: userId }).first();
    const loginA = await request(app).post('/api/auth/login').send({ email, password, deviceName: 'Phone' });
    const loginB = await request(app).post('/api/auth/login').send({ email, password, deviceName: 'Laptop' });
    expect(loginA.statusCode).toBe(200);
    expect(loginB.statusCode).toBe(200);
    const cookieA = cookieHeader(loginA);
    const cookieB = cookieHeader(loginB);
    const csrfA = cookieValue(loginA, 'fitlife_csrf');
    const sessions = await request(app).get('/api/sessions').set('Cookie', cookieA);
    expect(sessions.statusCode).toBe(200);
    expect(sessions.body).toHaveLength(2);
    const other = sessions.body.find(session => !session.current);
    const current = sessions.body.find(session => session.current);
    expect(other.deviceName).toBe('Laptop');
    const revoked = await request(app).delete(`/api/sessions/${other.id}`).set('Cookie', cookieA).set('X-CSRF-Token', csrfA);
    expect(revoked.statusCode).toBe(200);
    expect((await request(app).get('/api/sessions').set('Cookie', cookieA)).statusCode).toBe(200);
    expect((await request(app).get('/api/sessions').set('Cookie', cookieB)).statusCode).toBe(403);
    expect((await request(app).delete(`/api/sessions/${current.id}`).set('Cookie', cookieA).set('X-CSRF-Token', csrfA)).statusCode).toBe(400);
  });
});
