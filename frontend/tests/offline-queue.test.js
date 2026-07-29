const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'api.js'), 'utf8');

test('BUS-08 offline queue has bounded retention and deterministic telemetry', () => {
  assert.match(source, /OFFLINE_MAX_ITEMS = 100/);
  assert.match(source, /OFFLINE_MAX_AGE_MS = 7 \* 24/);
  assert.match(source, /async prune\(\)/);
  assert.match(source, /async stats\(\)/);
  assert.match(source, /API\.getOfflineQueueStatus/);
});

test('BUS-08 prunes before enqueue and flush', () => {
  assert.match(source, /async enqueue\(request\) \{\s+await this\.prune\(\)/);
  assert.match(source, /async flush\(send\) \{[\s\S]*await this\.prune\(\)/);
});
