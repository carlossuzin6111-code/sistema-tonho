const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('BUS-07 student session uses the protected session lifecycle', () => {
  const source = read('js/student.js');
  assert.match(source, /API\.post\('\/workout-sessions\/start'/);
  assert.match(source, /API\.patch\(`\/workout-sessions\/\$\{this\.state\.id\}\/activity`/);
  assert.match(source, /API\.post\(`\/workout-sessions\/\$\{this\.state\.id\}\/\$\{action\}`/);
  assert.match(source, /sessionStorage/);
});

test('BUS-07 clears timers before starting a new heartbeat/rest loop', () => {
  const source = read('js/student.js');
  assert.match(source, /clearTimers\(\)/);
  assert.match(source, /this\.heartbeatId = setInterval/);
  assert.match(source, /if \(this\.restId\) clearInterval\(this\.restId\)/);
});

test('BUS-07 actions are delegated through the CSP allowlist', () => {
  const events = read('js/events.js');
  for (const action of ['start-student-session', 'start-rest', 'complete-session', 'cancel-session']) {
    assert.match(events, new RegExp(`['"]${action}['"]\\s*:`));
  }
});
