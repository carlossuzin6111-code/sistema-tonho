describe('JWT configuration', () => {
  const originalSecret = process.env.JWT_SECRET;

  afterEach(() => {
    jest.resetModules();
    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalSecret;
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
    process.env.JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-bytes';
    jest.resetModules();

    expect(() => require('../middleware/auth')).not.toThrow();
  });
});
