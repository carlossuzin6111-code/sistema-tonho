const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const apiSource = fs.readFileSync('frontend/js/api.js', 'utf8');
const appSource = fs.readFileSync('frontend/js/app.js', 'utf8');
const authSource = fs.readFileSync('backend/src/controllers/authController.js', 'utf8');

test('mobile API renews a rotated refresh token after an unauthorized response', () => {
  assert.match(apiSource, /refreshMobileSession/);
  assert.match(apiSource, /\/auth\/refresh/);
  assert.match(apiSource, /Authorization = `Bearer \$\{mobileAccessToken\}`/);
  assert.match(apiSource, /retry: false/);
  assert.match(appSource, /setMobileAccessToken\(data\.accessToken\)/);
});

test('login exposes a short-lived access token for native bearer requests', () => {
  assert.match(authSource, /accessToken: createAccessToken\(user, sessionId\)/);
});
