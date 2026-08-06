const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

test('Email verification UI complies with accessibility, resend action and token URL handler', () => {
  const desktopHtml = fs.readFileSync(path.join(root, 'frontend/desktop.html'), 'utf8');
  const mobileHtml = fs.readFileSync(path.join(root, 'frontend/mobile.html'), 'utf8');

  for (const html of [desktopHtml, mobileHtml]) {
    assert.match(html, /id="email-unverified-banner"[^>]*role="status"/);
    assert.match(html, /data-action="resend-email-verification"/);
    assert.match(html, /id="profile-email-verification-container"/);
    assert.match(html, /id="profile-email-status-badge"/);
  }

  const eventsJs = fs.readFileSync(path.join(root, 'frontend/js/events.js'), 'utf8');
  assert.match(eventsJs, /'resend-email-verification':/);
  assert.match(eventsJs, /checkURLForVerifyEmailToken/);

  const appJs = fs.readFileSync(path.join(root, 'frontend/js/app.js'), 'utf8');
  assert.match(appJs, /function updateEmailVerificationUI/);
  assert.match(appJs, /async function handleResendEmailVerification/);
  assert.match(appJs, /async function checkURLForVerifyEmailToken/);
  assert.match(appJs, /API\.post\('\/auth\/verify-email'/);
  assert.match(appJs, /API\.post\('\/auth\/resend-verification'/);
});
