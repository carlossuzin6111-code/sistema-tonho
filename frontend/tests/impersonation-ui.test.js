const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

test('Support impersonation UI complies with accessibility, audit controls and revocation actions', () => {
  const desktopHtml = fs.readFileSync(path.join(root, 'frontend/desktop.html'), 'utf8');
  const mobileHtml = fs.readFileSync(path.join(root, 'frontend/mobile.html'), 'utf8');

  for (const html of [desktopHtml, mobileHtml]) {
    assert.match(html, /id="impersonation-warning-banner"[^>]*role="alert"/);
    assert.match(html, /data-action="end-impersonation"/);
    assert.match(html, /id="modal-start-impersonation"[^>]*role="dialog"/);
    assert.match(html, /id="start-impersonation-form"/);
    assert.match(html, /id="impersonation-target-user-id"/);
    assert.match(html, /id="impersonation-reason"/);
    assert.match(html, /id="start-impersonation-form-error"[^>]*role="alert"/);
    assert.match(html, /data-action="close-start-impersonation"/);
  }

  const eventsJs = fs.readFileSync(path.join(root, 'frontend/js/events.js'), 'utf8');
  assert.match(eventsJs, /'open-start-impersonation':/);
  assert.match(eventsJs, /'close-start-impersonation':/);
  assert.match(eventsJs, /'end-impersonation':/);
  assert.match(eventsJs, /'start-impersonation-form':/);

  const appJs = fs.readFileSync(path.join(root, 'frontend/js/app.js'), 'utf8');
  assert.match(appJs, /function updateImpersonationUI/);
  assert.match(appJs, /function openStartImpersonationModal/);
  assert.match(appJs, /function closeStartImpersonationModal/);
  assert.match(appJs, /async function handleStartImpersonationSubmit/);
  assert.match(appJs, /async function handleEndImpersonation/);
  assert.match(appJs, /API\.post\('\/support\/impersonations'/);
});
