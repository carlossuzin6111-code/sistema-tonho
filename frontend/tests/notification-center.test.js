const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const app = fs.readFileSync('frontend/js/app.js', 'utf8');
const events = fs.readFileSync('frontend/js/events.js', 'utf8');
const desktop = fs.readFileSync('frontend/desktop.html', 'utf8');
test('notification center loads owner-scoped items and supports read state', () => {
  assert.match(app, /API\.get\('\/notifications'\)/);
  assert.match(app, /deliveryLabels/);
  assert.match(app, /updateNotificationBadge\(data\.unreadCount\)/);
  assert.match(app, /API\.patch\(`\/notifications\/\$\{element\.dataset\.notificationId\}\/read`/);
  assert.match(app, /API\.get\('\/notifications\/preferences'\)/);
  assert.match(app, /API\.put\('\/notifications\/preferences'/);
  assert.match(events, /open-notifications/);
  assert.match(events, /mark-notification-read/);
  assert.match(desktop, /notification-unread-count/);
});
