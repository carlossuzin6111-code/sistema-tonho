const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(frontend, file), 'utf8');

test('student shell communicates paused and blocked lifecycle policies', () => {
  const app = read('js/app.js');
  const student = read('js/student.js');
  assert.match(app, /applyStudentAccessMode/);
  assert.match(app, /student-access-notice/);
  assert.match(app, /novos registros, chat e execução de treinos/);
  assert.match(student, /Treino indisponível durante pausa/);
});

test('desktop and mobile provide an accessible versioned assessment workspace', () => {
  for (const page of ['desktop.html', 'mobile.html']) {
    const html = read(page);
    assert.match(html, /id="modal-tab-assessments"[^>]*data-tab="assessments"/);
    assert.match(html, /id="modal-subpane-assessments"/);
    assert.match(html, /id="student-assessment-form"/);
    assert.match(html, /id="assessment-personal-notes"[^>]*aria-describedby="assessment-private-help"/);
    assert.match(html, /id="assessment-history"[^>]*aria-live="polite"/);
  }
});

test('assessment UI creates versions and renders clinical content through SafeDOM', () => {
  const personal = read('js/personal.js');
  const events = read('js/events.js');
  assert.match(personal, /API\.post\(`\/personal\/students\/\$\{selectedStudentId\}\/assessments`/);
  assert.match(personal, /createAssessmentVersionCard/);
  assert.match(personal, /SafeDOM\.el\('p', \{ text: value/);
  assert.match(events, /'student-assessment-form': event => handleStudentAssessmentSubmit\(event\)/);
});
