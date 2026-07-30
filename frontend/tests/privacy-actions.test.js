const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const profile = fs.readFileSync('frontend/js/profile.js', 'utf8');
const events = fs.readFileSync('frontend/js/events.js', 'utf8');
test('profile exposes authenticated LGPD export and session management actions', () => {
  assert.match(profile, /API\.get\('\/compliance\/export'\)/);
  assert.match(profile, /API\.get\('\/sessions'\)/);
  assert.match(events, /export-my-data/);
  assert.match(events, /manage-sessions/);
});
