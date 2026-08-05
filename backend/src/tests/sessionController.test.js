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

  beforeEach(async () => {
    await db('refresh_tokens').where({ user_id: userId }).del();
    await db('user_sessions').where({ user_id: userId }).del();
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
    expect(other.ipAddress).toMatch(/\/24$|\/64$/);
    expect(other).not.toHaveProperty('userAgent');
    const revoked = await request(app).delete(`/api/sessions/${other.id}`).set('Cookie', cookieA).set('X-CSRF-Token', csrfA);
    expect(revoked.statusCode).toBe(200);
    expect((await request(app).get('/api/sessions').set('Cookie', cookieA)).statusCode).toBe(200);
    expect((await request(app).get('/api/sessions').set('Cookie', cookieB)).statusCode).toBe(403);
    expect((await request(app).delete(`/api/sessions/${current.id}`).set('Cookie', cookieA).set('X-CSRF-Token', csrfA)).statusCode).toBe(400);
  });

  test('revokes every other device and its linked refresh token in one action', async () => {
    const loginA = await request(app).post('/api/auth/login').send({ email, password, deviceName: 'Current phone' });
    const loginB = await request(app).post('/api/auth/login').send({ email, password, deviceName: 'Old laptop' });
    const loginC = await request(app).post('/api/auth/login').send({ email, password, deviceName: 'Tablet' });
    const cookieA = cookieHeader(loginA);
    const csrfA = cookieValue(loginA, 'fitlife_csrf');

    const revoked = await request(app).delete('/api/sessions').set('Cookie', cookieA).set('X-CSRF-Token', csrfA);
    expect(revoked.statusCode).toBe(200);
    expect(revoked.body.revoked).toBe(2);
    expect((await request(app).get('/api/sessions').set('Cookie', cookieA)).body).toHaveLength(1);
    expect((await request(app).get('/api/sessions').set('Cookie', cookieHeader(loginB))).statusCode).toBe(403);
    expect((await request(app).get('/api/sessions').set('Cookie', cookieHeader(loginC))).statusCode).toBe(403);
    const refreshRows = await db('refresh_tokens').where({ user_id: userId }).orderBy('id');
    expect(refreshRows.filter(row => row.revoked_at)).toHaveLength(2);
  });

  test('logout revokes the current device and logout-all revokes every device', async () => {
    const loginA = await request(app).post('/api/auth/login').send({ email, password, deviceName: 'Phone' });
    const loginB = await request(app).post('/api/auth/login').send({ email, password, deviceName: 'Laptop' });
    const cookieA = cookieHeader(loginA);
    const logout = await request(app).post('/api/auth/logout').set('Cookie', cookieA).set('X-CSRF-Token', cookieValue(loginA, 'fitlife_csrf'));
    expect(logout.statusCode).toBe(200);
    expect((await request(app).get('/api/sessions').set('Cookie', cookieA)).statusCode).toBe(403);
    expect(await db('refresh_tokens').where({ user_id: userId }).whereNotNull('revoked_at')).toHaveLength(1);

    const cookieB = cookieHeader(loginB);
    const logoutAll = await request(app).post('/api/auth/logout-all').set('Cookie', cookieB).set('X-CSRF-Token', cookieValue(loginB, 'fitlife_csrf'));
    expect(logoutAll.statusCode).toBe(200);
    expect(logoutAll.body.revoked).toBe(1);
    expect(await db('user_sessions').where({ user_id: userId, status: 'active' }).count({ count: '*' }).first()).toMatchObject({ count: 0 });
    expect((await request(app).get('/api/sessions').set('Cookie', cookieB)).statusCode).toBe(403);
    expect(await db('refresh_tokens').where({ user_id: userId }).whereNotNull('revoked_at')).toHaveLength(2);
  });

  test('removes revoked session records after the retention window', async () => {
    const login = await request(app).post('/api/auth/login').send({ email, password, deviceName: 'Phone' });
    await db('user_sessions').insert({ id: 'old-revoked-session', user_id: userId, device_name: 'Old', status: 'revoked', revoked_at: '2020-01-01T00:00:00.000Z', last_seen_at: '2020-01-01T00:00:00.000Z' });
    const listed = await request(app).get('/api/sessions').set('Cookie', cookieHeader(login));
    expect(listed.statusCode).toBe(200);
    expect(await db('user_sessions').where({ id: 'old-revoked-session' }).first()).toBeUndefined();
  });

  test('refresh rotation reuses its device session and rejects family replay', async () => {
    const login = await request(app).post('/api/auth/login').send({ email, password, deviceName: 'Native phone' });
    const initialToken = login.body.refreshToken;
    const initialSessions = await db('user_sessions').where({ user_id: userId, status: 'active' });
    expect(initialSessions).toHaveLength(1);

    const rotated = await request(app).post('/api/auth/refresh').send({ refreshToken: initialToken });
    expect(rotated.statusCode).toBe(200);
    expect(await db('user_sessions').where({ user_id: userId, status: 'active' })).toHaveLength(1);
    expect((await db('refresh_tokens').where({ token_hash: require('crypto').createHash('sha256').update(rotated.body.refreshToken).digest('hex') }).first()).session_id).toBe(initialSessions[0].id);

    expect((await request(app).post('/api/auth/refresh').send({ refreshToken: initialToken })).statusCode).toBe(401);
    expect((await request(app).post('/api/auth/refresh').send({ refreshToken: rotated.body.refreshToken })).statusCode).toBe(401);
    expect(await db('user_sessions').where({ user_id: userId, status: 'active' })).toHaveLength(0);
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${rotated.body.accessToken}`)).statusCode).toBe(403);
  });

  test('session limit also revokes the refresh token linked to the pruned device', async () => {
    const logins = [];
    for (let index = 1; index <= 6; index += 1) {
      logins.push(await request(app).post('/api/auth/login').send({ email, password, deviceName: `Device ${index}` }));
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    expect(await db('user_sessions').where({ user_id: userId, status: 'active' })).toHaveLength(5);
    expect((await request(app).get('/api/sessions').set('Cookie', cookieHeader(logins[0]))).statusCode).toBe(403);
    expect((await request(app).post('/api/auth/refresh').send({ refreshToken: logins[0].body.refreshToken })).statusCode).toBe(401);
  });
});
