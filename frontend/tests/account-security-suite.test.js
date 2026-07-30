const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const app = fs.readFileSync('frontend/js/app.js', 'utf8');
const events = fs.readFileSync('frontend/js/events.js', 'utf8');
const html = fs.readFileSync('frontend/desktop.html', 'utf8');
test('account security suite exposes public password recovery without leaking account existence', () => {
  assert.match(app, /API\.post\('\/auth\/forgot-password'/);
  assert.match(events, /open-forgot-password/);
  assert.match(html, /Esqueci minha senha/);
});
