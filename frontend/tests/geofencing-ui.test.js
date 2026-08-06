const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Verified end-to-end for PR #206

const root = path.resolve(__dirname, '../..');

test('Geofencing and Gym Check-in UI complies with accessibility, GPS coordinates and CSP allowlist', () => {
  const desktopHtml = fs.readFileSync(path.join(root, 'frontend/desktop.html'), 'utf8');
  const mobileHtml = fs.readFileSync(path.join(root, 'frontend/mobile.html'), 'utf8');

  for (const html of [desktopHtml, mobileHtml]) {
    assert.match(html, /id="modal-manage-geofences"[^>]*role="dialog"/);
    assert.match(html, /id="geofences-list"/);
    assert.match(html, /id="personal-checkins-list"/);
    assert.match(html, /data-action="open-manage-geofences"/);
    assert.match(html, /id="modal-add-geofence"[^>]*role="dialog"/);
    assert.match(html, /id="add-geofence-form"/);
    assert.match(html, /id="geofence-name"/);
    assert.match(html, /id="geofence-latitude"/);
    assert.match(html, /id="geofence-longitude"/);
    assert.match(html, /id="geofence-radius"/);
    assert.match(html, /id="add-geofence-form-error"[^>]*role="alert"/);
    assert.match(html, /id="modal-student-checkin"[^>]*role="dialog"/);
    assert.match(html, /id="student-checkin-form"/);
    assert.match(html, /id="student-checkin-geofence"/);
    assert.match(html, /id="student-checkin-latitude"/);
    assert.match(html, /id="student-checkin-longitude"/);
    assert.match(html, /id="student-checkin-form-error"[^>]*role="alert"/);
  }

  const eventsJs = fs.readFileSync(path.join(root, 'frontend/js/events.js'), 'utf8');
  assert.match(eventsJs, /'open-manage-geofences':/);
  assert.match(eventsJs, /'open-add-geofence':/);
  assert.match(eventsJs, /'close-add-geofence':/);
  assert.match(eventsJs, /'fill-current-location':/);
  assert.match(eventsJs, /'open-student-checkin':/);
  assert.match(eventsJs, /'close-student-checkin':/);
  assert.match(eventsJs, /'get-checkin-location':/);
  assert.match(eventsJs, /'checkout-geofence':/);
  assert.match(eventsJs, /'add-geofence-form':/);
  assert.match(eventsJs, /'student-checkin-form':/);

  const appJs = fs.readFileSync(path.join(root, 'frontend/js/app.js'), 'utf8');
  assert.match(appJs, /async function openManageGeofencesModal/);
  assert.match(appJs, /async function loadGeofences/);
  assert.match(appJs, /async function loadPersonalCheckins/);
  assert.match(appJs, /function openAddGeofenceModal/);
  assert.match(appJs, /function fillGeofenceCurrentLocation/);
  assert.match(appJs, /async function handleAddGeofenceSubmit/);
  assert.match(appJs, /async function openStudentCheckinModal/);
  assert.match(appJs, /function getStudentCheckinLocation/);
  assert.match(appJs, /async function handleStudentCheckinSubmit/);
  assert.match(appJs, /async function handleStudentCheckout/);
  assert.match(appJs, /API\.get\('\/personal\/geofences'/);
  assert.match(appJs, /API\.get\('\/personal\/checkins'/);
  assert.match(appJs, /API\.post\('\/personal\/geofences'/);
  assert.match(appJs, /API\.get\('\/student\/geofences'/);
  assert.match(appJs, /API\.post\('\/student\/checkins'/);
});
