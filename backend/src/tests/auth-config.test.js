describe('JWT configuration', () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    jest.resetModules();
    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalSecret;
    }
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  test('fails to load when JWT_SECRET is missing', () => {
    delete process.env.JWT_SECRET;
    jest.resetModules();

    expect(() => require('../middleware/auth')).toThrow('JWT_SECRET environment variable is required');
  });

  test('fails to load when JWT_SECRET is too short', () => {
    process.env.JWT_SECRET = 'short-secret';
    jest.resetModules();

    expect(() => require('../middleware/auth')).toThrow('JWT_SECRET must contain at least 32 bytes');
  });

  test('loads when JWT_SECRET has at least 32 bytes', () => {
    process.env.JWT_SECRET = ['test-only', 'jwt-secret', 'with-at-least-32-bytes'].join('-');
    jest.resetModules();

    expect(() => require('../middleware/auth')).not.toThrow();
  });

  test('rejects placeholder secrets in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = ['replace', 'with-a-secret', 'that-is-at-least-32-bytes'].join('-');
    jest.resetModules();

    expect(() => require('../middleware/auth')).toThrow('JWT_SECRET must be random and cannot use a placeholder in production');
  });

  test('rejects predictable repeated secrets in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a'.repeat(32);
    jest.resetModules();

    expect(() => require('../middleware/auth')).toThrow('JWT_SECRET must be random and cannot use a placeholder in production');
  });
});
