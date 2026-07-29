process.env.NODE_ENV = 'test';
const { redact } = require('../services/logger');

describe('structured logger redaction', () => {
  test('redacts nested credentials and preserves operational fields', () => {
    const value = redact({ password: 'secret', nested: { accessToken: 'token', email: 'user@example.com' }, status: 200 });
    expect(value).toEqual({ password: '[REDACTED]', nested: { accessToken: '[REDACTED]', email: 'user@example.com' }, status: 200 });
  });
});
