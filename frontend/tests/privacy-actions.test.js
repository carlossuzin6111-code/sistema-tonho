const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const profile = fs.readFileSync('frontend/js/profile.js', 'utf8');
const events = fs.readFileSync('frontend/js/events.js', 'utf8');
const pages = ['frontend/desktop.html', 'frontend/mobile.html'].map(file => fs.readFileSync(file, 'utf8'));
test('profile exposes authenticated LGPD export and session management actions', () => {
  assert.match(profile, /API\.get\('\/compliance\/export'\)/);
  assert.match(profile, /API\.get\('\/sessions'\)/);
  assert.match(profile, /API\.delete\(`\/sessions\/\$\{encodeURIComponent\(element\.dataset\.sessionId\)\}`/);
  assert.match(profile, /API\.delete\('\/sessions'\)/);
  assert.match(profile, /API\.post\('\/auth\/logout-all'/);
  assert.doesNotMatch(profile, /window\.confirm/);
  assert.match(events, /export-my-data/);
  assert.match(events, /manage-sessions/);
  assert.match(events, /revoke-other-sessions/);
  for (const html of pages) {
    assert.match(html, /id="modal-manage-sessions"/);
    assert.match(html, /id="profile-sessions-list"[^>]*aria-label="Sessões ativas"/);
  }
});
