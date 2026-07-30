const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('frontend/js/secure-storage.js', 'utf8');

test('secure storage bridge has no insecure token fallback', () => {
  assert.match(source, /Capacitor\?\.Plugins\?\.SecureStorage/);
  assert.match(source, /globalThis\.FitLifeSecureStorage/);
  assert.doesNotMatch(source, /localStorage/);
  assert.doesNotMatch(source, /sessionStorage/);
});
