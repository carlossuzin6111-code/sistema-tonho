const test = require('node:test');
const assert = require('node:assert/strict');
const source = require('node:fs').readFileSync('frontend/js/app.js', 'utf8');
test('chat SSE lifecycle events update or redact an existing safe bubble', () => {
  assert.match(source, /message\.updated.*message\.deleted/);
  assert.match(source, /data-message-id/);
  assert.match(source, /Mensagem excluída/);
  assert.match(source, /handleChatLifecycleEvent\(message\)/);
});
