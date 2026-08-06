const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

test('Partner consent UI complies with accessibility, scope authorization and CSP allowlist', () => {
  const desktopHtml = fs.readFileSync(path.join(root, 'frontend/desktop.html'), 'utf8');
  const mobileHtml = fs.readFileSync(path.join(root, 'frontend/mobile.html'), 'utf8');

  for (const html of [desktopHtml, mobileHtml]) {
    assert.match(html, /id="profile-tab-partners"/);
    assert.match(html, /id="profile-panel-partners"/);
    assert.match(html, /id="partner-consents-list"/);
    assert.match(html, /id="modal-grant-partner-consent"[^>]*role="dialog"/);
    assert.match(html, /id="grant-partner-consent-form"/);
    assert.match(html, /id="grant-partner-select"/);
    assert.match(html, /value="workout_logs"/);
    assert.match(html, /value="measurements"/);
    assert.match(html, /value="exams"/);
    assert.match(html, /id="grant-partner-consent-form-error"[^>]*role="alert"/);
    assert.match(html, /data-action="open-grant-partner-consent"/);
    assert.match(html, /data-action="close-grant-partner-consent"/);
  }

  const eventsJs = fs.readFileSync(path.join(root, 'frontend/js/events.js'), 'utf8');
  assert.match(eventsJs, /'open-grant-partner-consent':/);
  assert.match(eventsJs, /'close-grant-partner-consent':/);
  assert.match(eventsJs, /'revoke-partner-consent':/);
  assert.match(eventsJs, /'grant-partner-consent-form':/);

  const appJs = fs.readFileSync(path.join(root, 'frontend/js/app.js'), 'utf8');
  assert.match(appJs, /async function loadPartnerConsents/);
  assert.match(appJs, /async function openGrantPartnerConsentModal/);
  assert.match(appJs, /function closeGrantPartnerConsentModal/);
  assert.match(appJs, /async function handleGrantPartnerConsentSubmit/);
  assert.match(appJs, /async function handleRevokePartnerConsent/);
  assert.match(appJs, /API\.get\('\/student\/partner-consents'/);
  assert.match(appJs, /API\.post\('\/student\/partner-consents'/);
  assert.match(appJs, /API\.delete\('\/student\/partner-consents\/'/);
});
