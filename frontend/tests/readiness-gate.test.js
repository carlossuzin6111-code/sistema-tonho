const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const student = fs.readFileSync('frontend/js/student.js', 'utf8');
const events = fs.readFileSync('frontend/js/events.js', 'utf8');

test('student workout loading requires a same-day readiness check-in', () => {
  assert.match(student, /API\.get\('\/student\/readiness'\)/);
  assert.match(student, /item\.date === localDateKey\(\)/);
  assert.match(student, /renderReadinessPrompt\(container\)/);
});

test('readiness form posts the four validated scales through the action allowlist', () => {
  assert.match(student, /API\.post\('\/student\/readiness'/);
  assert.match(student, /new FormData\(form\)/);
  assert.match(events, /student-readiness-form/);
});
