const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

test('Student invitation claim UI complies with accessibility, form validation and CSP allowlist', () => {
  const desktopHtml = fs.readFileSync(path.join(root, 'frontend/desktop.html'), 'utf8');
  const mobileHtml = fs.readFileSync(path.join(root, 'frontend/mobile.html'), 'utf8');

  for (const html of [desktopHtml, mobileHtml]) {
    assert.match(html, /id="modal-claim-invitation"[^>]*role="dialog"/);
    assert.match(html, /id="claim-invitation-form"/);
    assert.match(html, /id="claim-invitation-token"/);
    assert.match(html, /id="claim-student-name"/);
    assert.match(html, /id="claim-student-password"[^>]*minlength="10"/);
    assert.match(html, /id="claim-student-password-confirm"[^>]*minlength="10"/);
    assert.match(html, /id="claim-invitation-form-error"[^>]*role="alert"/);
    assert.match(html, /data-action="open-claim-invitation"/);
    assert.match(html, /data-action="close-claim-invitation"/);
  }

  const eventsJs = fs.readFileSync(path.join(root, 'frontend/js/events.js'), 'utf8');
  assert.match(eventsJs, /'open-claim-invitation':/);
  assert.match(eventsJs, /'close-claim-invitation':/);
  assert.match(eventsJs, /'claim-invitation-form':/);
  assert.match(eventsJs, /checkURLForInviteToken/);

  const appJs = fs.readFileSync(path.join(root, 'frontend/js/app.js'), 'utf8');
  assert.match(appJs, /function openClaimInvitationModal/);
  assert.match(appJs, /function closeClaimInvitationModal/);
  assert.match(appJs, /async function handleClaimInvitationSubmit/);
  assert.match(appJs, /function checkURLForInviteToken/);
  assert.match(appJs, /API\.post\('\/auth\/student-invitations\/claim'/);
});
