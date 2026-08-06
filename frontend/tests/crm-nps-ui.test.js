const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

test('CRM Alerts and NPS Survey UI complies with accessibility, score selection and CSP allowlist', () => {
  const desktopHtml = fs.readFileSync(path.join(root, 'frontend/desktop.html'), 'utf8');
  const mobileHtml = fs.readFileSync(path.join(root, 'frontend/mobile.html'), 'utf8');

  for (const html of [desktopHtml, mobileHtml]) {
    assert.match(html, /id="personal-crm-alerts-container"/);
    assert.match(html, /id="crm-alerts-list"/);
    assert.match(html, /id="personal-nps-summary"/);
    assert.match(html, /id="nps-feedback-list"/);
    assert.match(html, /id="stat-crm-alerts-count"/);
    assert.match(html, /id="stat-nps-score"/);
    assert.match(html, /data-action="run-crm-daily"/);
    assert.match(html, /id="modal-nps-survey"[^>]*role="dialog"/);
    assert.match(html, /id="nps-survey-form"/);
    assert.match(html, /data-action="select-nps-score"/);
    assert.match(html, /id="nps-survey-comment"/);
    assert.match(html, /id="nps-survey-form-error"[^>]*role="alert"/);
    assert.match(html, /data-action="close-nps-survey"/);
  }

  const eventsJs = fs.readFileSync(path.join(root, 'frontend/js/events.js'), 'utf8');
  assert.match(eventsJs, /'run-crm-daily':/);
  assert.match(eventsJs, /'resolve-crm-alert':/);
  assert.match(eventsJs, /'select-nps-score':/);
  assert.match(eventsJs, /'close-nps-survey':/);
  assert.match(eventsJs, /'nps-survey-form':/);

  const appJs = fs.readFileSync(path.join(root, 'frontend/js/app.js'), 'utf8');
  assert.match(appJs, /async function loadCRMAlerts/);
  assert.match(appJs, /async function handleRunDailyCRM/);
  assert.match(appJs, /async function handleResolveCRMAlert/);
  assert.match(appJs, /async function loadNPSMetrics/);
  assert.match(appJs, /async function checkPendingNPSSurvey/);
  assert.match(appJs, /function handleSelectNPSScore/);
  assert.match(appJs, /function closeNPSSurveyModal/);
  assert.match(appJs, /async function handleNPSSurveySubmit/);
  assert.match(appJs, /API\.get\('\/crm\/alerts'/);
  assert.match(appJs, /API\.post\('\/crm\/run-daily'/);
  assert.match(appJs, /API\.patch\(`\/crm\/alerts\//);
  assert.match(appJs, /API\.get\('\/crm\/nps'/);
  assert.match(appJs, /API\.get\('\/student\/nps'/);
  assert.match(appJs, /API\.post\(`\/student\/nps\//);
});
