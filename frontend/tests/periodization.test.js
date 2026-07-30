const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'personal.js'), 'utf8');

test('BUS-13 exposes an accessible periodization editor backed by the API', () => {
  assert.match(source, /API\.get\(`\/workouts\/\$\{workout\.id\}\/periodization`/);
  assert.match(source, /API\.put\(`\/workouts\/\$\{workout\.id\}\/periodization`/);
  assert.match(source, /container\.children\.length >= 52/);
  assert.match(source, /role: 'region'/);
  assert.match(source, /data-field.*intensity/);
});
