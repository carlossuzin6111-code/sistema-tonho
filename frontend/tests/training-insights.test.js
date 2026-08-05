const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const frontend = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(frontend, file), 'utf8');

test('student pages expose accessible adherence and progression regions', () => {
  for (const page of ['desktop.html', 'mobile.html']) {
    const html = read(page);
    assert.match(html, /id="training-insights-title"/);
    assert.match(html, /id="student-adherence-summary"[^>]*aria-live="polite"/);
    assert.match(html, /id="student-progression-list"[^>]*aria-live="polite"/);
  }
});

test('student insights combine goals, Epley estimates and published periodization', () => {
  const student = read('js/student.js');
  const personal = read('js/personal.js');
  assert.match(student, /API\.get\('\/personal\/students\/adherence'\)/);
  assert.match(student, /API\.get\('\/student\/progression'\)/);
  assert.match(student, /1-RM estimado \(Epley\)/);
  assert.match(student, /progression-history/);
  assert.match(student, /70% do 1-RM de Epley/);
  assert.match(student, /API\.get\(`\/workouts\/\$\{workout\.id\}\/periodization`/);
  assert.match(personal, /training-goal/);
});
