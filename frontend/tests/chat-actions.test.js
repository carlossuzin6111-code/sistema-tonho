const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const safeDom = fs.readFileSync('frontend/js/safe-dom.js', 'utf8');
const actions = fs.readFileSync('frontend/js/chat-actions.js', 'utf8');
const events = fs.readFileSync('frontend/js/events.js', 'utf8');
test('chat controls use owner-scoped edit/delete API routes and safe text rendering', () => {
  assert.match(safeDom, /data-action': 'edit-chat-message'/);
  assert.match(actions, /API\.put\(`\/chat\/\$\{encodeURIComponent\(element\.dataset\.messageId\)\}`/);
  assert.match(actions, /API\.delete\(`\/chat\/\$\{encodeURIComponent\(element\.dataset\.messageId\)\}`/);
  assert.match(events, /delete-chat-message/);
});
