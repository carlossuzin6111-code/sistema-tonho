const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('frontend/js/student.js', 'utf8');

test('active workout session refreshes heartbeat when returning to the foreground', () => {
  assert.match(source, /visibilitychange/);
  assert.match(source, /document\.visibilityState === 'visible'/);
  assert.match(source, /this\.heartbeat\(\)/);
  assert.match(source, /removeEventListener\('visibilitychange'/);
});

test('corrupted recovery state is discarded instead of breaking the student dashboard', () => {
  assert.match(source, /try \{ saved = JSON\.parse\(sessionStorage\.getItem\(key\) \|\| 'null'\); \}/);
  assert.match(source, /sessionStorage\.removeItem\(key\)/);
});
