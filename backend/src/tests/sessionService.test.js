process.env.JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-bytes';

const {
  CSRF_COOKIE,
  SESSION_COOKIE,
  clearSessionCookies,
  setSessionCookies,
  verifySessionToken
} = require('../services/sessionService');

function responseRecorder() {
  return {
    cookies: [],
    append(name, value) {
      if (name === 'Set-Cookie') this.cookies.push(value);
    }
  };
}

function cookieValue(cookie, name) {
  return decodeURIComponent(cookie.split(';', 1)[0].slice(name.length + 1));
}

describe('session cookies', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  test('uses secure HttpOnly session and readable CSRF cookies in production', () => {
    process.env.NODE_ENV = 'production';
    const res = responseRecorder();

    setSessionCookies(res, {
      id: 42,
      name: 'Cookie User',
      email: 'cookie@example.com',
      role: 'personal'
    });

    const sessionCookie = res.cookies.find(cookie => cookie.startsWith(`${SESSION_COOKIE}=`));
    const csrfCookie = res.cookies.find(cookie => cookie.startsWith(`${CSRF_COOKIE}=`));
    expect(sessionCookie).toContain('HttpOnly');
    expect(sessionCookie).toContain('Secure');
    expect(sessionCookie).toContain('SameSite=Strict');
    expect(sessionCookie).toContain('Path=/api');
    expect(csrfCookie).not.toContain('HttpOnly');
    expect(csrfCookie).toContain('Secure');
    expect(csrfCookie).toContain('SameSite=Strict');
    expect(csrfCookie).toContain('Path=/');

    const payload = verifySessionToken(cookieValue(sessionCookie, SESSION_COOKIE));
    expect(payload.csrf).toBe(cookieValue(csrfCookie, CSRF_COOKIE));
  });

  test('clears both cookies using their original attributes', () => {
    process.env.NODE_ENV = 'production';
    const res = responseRecorder();

    clearSessionCookies(res);

    expect(res.cookies).toHaveLength(2);
    for (const cookie of res.cookies) {
      expect(cookie).toContain('Max-Age=0');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain('Secure');
    }
  });
});
