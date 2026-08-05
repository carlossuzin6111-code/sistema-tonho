const packageJson = require('../../package.json');

describe('backend test lifecycle', () => {
  test('detects open handles without forcing the Jest process to exit', () => {
    expect(packageJson.scripts.test).toContain('--detectOpenHandles');
    expect(packageJson.scripts.test).not.toContain('--forceExit');
  });

  test('registers the shared database teardown for every suite', () => {
    expect(packageJson.jest.setupFilesAfterEnv).toContain(
      '<rootDir>/src/tests/setupLifecycle.js'
    );
  });
});
