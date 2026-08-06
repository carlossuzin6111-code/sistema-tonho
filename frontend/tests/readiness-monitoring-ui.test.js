const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const root = `${__dirname}/../..`;

test('readiness monitoring is available in both student detail layouts', () => {
  for (const file of ['frontend/desktop.html', 'frontend/mobile.html']) {
    const html = fs.readFileSync(`${root}/${file}`, 'utf8');
    assert.match(html, /id="modal-tab-readiness"[^>]*data-tab="readiness"/);
    assert.match(html, /id="modal-subpane-readiness"[^>]*class="modal-subpane"/);
    assert.match(html, /id="student-readiness-history"[^>]*aria-live="polite"/);
  }
});

test('readiness monitoring keeps the API scoped and non-diagnostic', () => {
  const personal = fs.readFileSync(`${root}/frontend/js/personal.js`, 'utf8');
  assert.match(personal, /async function loadStudentReadiness/);
  assert.match(personal, /API\.get\(`\/personal\/students\/\$\{studentId\}\/readiness`\)/);
  assert.match(personal, /o score não é diagnóstico nem prescrição de treino/);
  assert.match(personal, /loadStudentReadiness\(student\.id\)/);
  assert.match(personal, /subtab === 'readiness'/);
});
