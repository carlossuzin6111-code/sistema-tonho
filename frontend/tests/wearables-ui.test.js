const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

test('Wearables UI complies with accessibility, provider selection and CSP allowlist', () => {
  const desktopHtml = fs.readFileSync(path.join(root, 'frontend/desktop.html'), 'utf8');
  const mobileHtml = fs.readFileSync(path.join(root, 'frontend/mobile.html'), 'utf8');

  for (const html of [desktopHtml, mobileHtml]) {
    assert.match(html, /id="modal-manage-wearables"[^>]*role="dialog"/);
    assert.match(html, /id="wearables-connections-list"/);
    assert.match(html, /id="wearables-metrics-list"/);
    assert.match(html, /id="modal-connect-wearable"[^>]*role="dialog"/);
    assert.match(html, /id="connect-wearable-form"/);
    assert.match(html, /id="connect-wearable-provider"/);
    assert.match(html, /value="apple_healthkit"/);
    assert.match(html, /value="google_health_connect"/);
    assert.match(html, /value="garmin"/);
    assert.match(html, /id="connect-wearable-form-error"[^>]*role="alert"/);
    assert.match(html, /data-action="open-manage-wearables"/);
    assert.match(html, /data-action="open-connect-wearable"/);
    assert.match(html, /data-action="close-connect-wearable"/);
  }

  const eventsJs = fs.readFileSync(path.join(root, 'frontend/js/events.js'), 'utf8');
  assert.match(eventsJs, /'open-manage-wearables':/);
  assert.match(eventsJs, /'open-connect-wearable':/);
  assert.match(eventsJs, /'close-connect-wearable':/);
  assert.match(eventsJs, /'revoke-wearable-connection':/);
  assert.match(eventsJs, /'connect-wearable-form':/);

  const appJs = fs.readFileSync(path.join(root, 'frontend/js/app.js'), 'utf8');
  assert.match(appJs, /async function openManageWearablesModal/);
  assert.match(appJs, /function closeManageWearablesModal/);
  assert.match(appJs, /async function loadWearableConnections/);
  assert.match(appJs, /async function loadWearableMetrics/);
  assert.match(appJs, /function openConnectWearableModal/);
  assert.match(appJs, /function closeConnectWearableModal/);
  assert.match(appJs, /async function handleConnectWearableSubmit/);
  assert.match(appJs, /async function handleRevokeWearableConnection/);
  assert.match(appJs, /API\.get\('\/wearables\/connections'/);
  assert.match(appJs, /API\.post\('\/wearables\/connections'/);
  assert.match(appJs, /API\.delete\('\/wearables\/connections\/'/);
});
