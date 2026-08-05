const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(frontend, file), 'utf8');

test('student shell verifies the current waiver before tabs and SSE', () => {
  const app = read('js/app.js');
  assert.match(app, /API\.get\('\/profile\/waivers\/current'\)/);
  assert.match(app, /if \(status\.signed\) return activateStudentDashboard/);
  assert.match(app, /function activateStudentDashboard[\s\S]*switchStudentTab[\s\S]*connectRealTimeUpdates/);
  assert.match(app, /if \(!user\.mustChangePassword\) ensureCurrentWaiver\(user, generation\)/);
});

test('required PAR-Q dialog is complete, explicit and cannot be dismissed', () => {
  const app = read('js/app.js');
  const questions = app.match(/const PARQ_QUESTIONS = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || '';
  assert.equal((questions.match(/^  \['[^']+', '/gm) || []).length, 7);
  assert.match(app, /type: 'radio', name: key, value, required: ''/);
  assert.match(app, /type: 'checkbox', name: 'acceptedTerms', required: ''/);
  assert.match(app, /'data-required-modal': 'true'/);
  assert.match(app, /modal\.dataset\.requiredModal === 'true'/);
  assert.match(app, /'data-action': 'logout'/);
  assert.match(app, /waiverModal\.dataset\.requiredModal = 'false'/);
  assert.match(app, /API\.post\('\/profile\/waivers', \{ termsVersion: modal\.dataset\.termsVersion, parqAnswers \}\)/);
});

test('waiver form uses delegated submission and mobile-safe scrolling', () => {
  const events = read('js/events.js');
  const style = read('css/style.css');
  assert.match(events, /'current-waiver-form': event => submitCurrentWaiver\(event\)/);
  assert.match(style, /\.waiver-modal-content[^}]*max-height:[^}]*overflow-y: auto/s);
  assert.match(style, /\.waiver-question label[^}]*min-height: 44px/s);
});
