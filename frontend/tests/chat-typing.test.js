const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('BUS-11 exposes a debounced typing mutation and SSE renderer', () => {
  const app = read('js/app.js');
  const events = read('js/events.js');
  assert.match(app, /API\.post\('\/chat\/typing'/);
  assert.match(app, /setTimeout\(\(\) =>/);
  assert.match(app, /message\?\.type !== 'typing'/);
  assert.match(events, /handleChatTypingInput\(event\.target\)/);
});

test('BUS-11 declares accessible typing indicators in both layouts', () => {
  for (const file of ['desktop.html', 'mobile.html']) {
    const html = read(file);
    assert.match(html, /id="personal-chat-typing"[^>]*role="status"/);
    assert.match(html, /id="student-chat-typing"[^>]*role="status"/);
  }
});
