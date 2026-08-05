const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(frontend, file), 'utf8');

test('student chat loads bounded cursor pages and preserves scroll position', () => {
  const source = read('js/student.js');
  assert.match(source, /API\.get\(`\/chat\?limit=\$\{CHAT_PAGE_SIZE\}`\)/);
  assert.match(source, /before=\$\{encodeURIComponent\(cursor\)\}/);
  assert.match(source, /box\.scrollTop \+= box\.scrollHeight - previousHeight/);
  assert.match(source, /studentChatHistory\.loading/);
  assert.match(source, /data-message-id/);
});

test('personal chat isolates pagination from stale thread responses', () => {
  const source = read('js/personal.js');
  assert.match(source, /requestId !== personalChatHistory\.requestId/);
  assert.match(source, /String\(activeChatStudentId\) !== studentId/);
  assert.match(source, /before=\$\{encodeURIComponent\(cursor\)\}/);
  assert.match(source, /box\.scrollTop \+= box\.scrollHeight - previousHeight/);
  assert.match(source, /data-message-id/);
});

test('history controls are delegated, accessible and styled for touch', () => {
  const events = read('js/events.js');
  const student = read('js/student.js');
  const personal = read('js/personal.js');
  const style = read('css/style.css');
  assert.match(events, /'load-older-student-chat': \(\) => loadOlderStudentChat\(\)/);
  assert.match(events, /'load-older-personal-chat': \(\) => loadOlderPersonalChat\(\)/);
  assert.match(student, /attrs: \{ type: 'button', 'data-action': action \}/);
  assert.match(personal, /attrs: \{ type: 'button', 'data-action': 'load-older-personal-chat' \}/);
  assert.match(style, /\.chat-history-load[^}]*min-height: 44px/s);
});
