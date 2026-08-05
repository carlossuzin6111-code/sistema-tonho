const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(frontend, file), 'utf8');

test('mobile student filters are in the dashboard, not in the login form', () => {
  const html = read('mobile.html');
  const login = html.slice(html.indexOf('<form id="login-form"'), html.indexOf('</form>', html.indexOf('<form id="login-form"')));
  const students = html.slice(html.indexOf('<div id="tab-p-students"'), html.indexOf('<div id="tab-p-create"'));
  assert.doesNotMatch(login, /student-status-tabs/);
  assert.match(students, /student-status-tabs/);
  assert.equal((html.match(/class="student-status-tabs"/g) || []).length, 1);
});

test('desktop and mobile expose lifecycle controls in student details', () => {
  for (const page of ['desktop.html', 'mobile.html']) {
    const html = read(page);
    assert.match(html, /id="modal-student-lifecycle"/);
    assert.match(html, /id="modal-lifecycle-history"[^>]*aria-live="polite"/);
  }
});

test('personal dashboard includes auditable lifecycle actions for students and workouts', () => {
  const script = read('js/personal.js');
  assert.match(script, /STUDENT_LIFECYCLE_OPTIONS/);
  assert.match(script, /confirmStudentLifecycleChange/);
  assert.match(script, /confirmWorkoutStatusChange/);
  assert.match(script, /renderStudentLifecycleHistory/);
  assert.match(script, /API\.get\('\/audit-logs'\)/);
  assert.match(script, /API\.patch\(`\/workouts\/\$\{workout\.id\}\/status`/);
  assert.match(script, /openDestructiveConfirmation/);
});
