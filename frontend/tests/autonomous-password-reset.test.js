const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

test('Autonomous password reset UI complies with accessibility, form validation and CSP allowlist', () => {
  const desktopHtml = fs.readFileSync(path.join(root, 'frontend/desktop.html'), 'utf8');
  const mobileHtml = fs.readFileSync(path.join(root, 'frontend/mobile.html'), 'utf8');

  for (const html of [desktopHtml, mobileHtml]) {
    assert.match(html, /id="modal-autonomous-reset-password"[^>]*role="dialog"/);
    assert.match(html, /id="autonomous-reset-password-form"/);
    assert.match(html, /id="autonomous-reset-token"/);
    assert.match(html, /id="autonomous-new-password"[^>]*minlength="10"/);
    assert.match(html, /id="autonomous-confirm-password"[^>]*minlength="10"/);
    assert.match(html, /id="autonomous-reset-password-form-error"[^>]*role="alert"/);
    assert.match(html, /data-action="close-autonomous-reset"/);
  }

  const eventsJs = fs.readFileSync(path.join(root, 'frontend/js/events.js'), 'utf8');
  assert.match(eventsJs, /'open-autonomous-reset':/);
  assert.match(eventsJs, /'close-autonomous-reset':/);
  assert.match(eventsJs, /'autonomous-reset-password-form':/);
  assert.match(eventsJs, /checkURLForResetToken/);

  const appJs = fs.readFileSync(path.join(root, 'frontend/js/app.js'), 'utf8');
  assert.match(appJs, /function openAutonomousResetModal/);
  assert.match(appJs, /function closeAutonomousResetModal/);
  assert.match(appJs, /async function handleAutonomousResetPasswordSubmit/);
  assert.match(appJs, /function checkURLForResetToken/);
  assert.match(appJs, /API\.post\('\/auth\/reset-password'/);
});
