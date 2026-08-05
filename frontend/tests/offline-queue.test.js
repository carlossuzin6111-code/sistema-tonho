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
  assert.match(source, /async function getOfflineQueueStatus/);
  assert.match(source, /fitlife:offline-queue/);
});

test('BUS-08 prunes before enqueue and flush', () => {
  assert.match(source, /async enqueue\(request\) \{\s+await this\.prune\(\)/);
  assert.match(source, /async flush\(send\) \{[\s\S]*await this\.prune\(\)/);
});

test('BUS-08 queues only recoverable mutations with an existing session identity', () => {
  assert.ok(source.includes("/^\\/workout-sessions\\/\\d+\\/(?:exercises\\/\\d+|complete|cancel)$/"));
  assert.ok(!source.includes("/^\\/workout-sessions(?:\\/|$)/"));
});

test('BUS-08 retains transient network failures for a later retry', () => {
  assert.match(source, /error\.retryable = true/);
  assert.match(source, /err\?\.name === 'TypeError'/);
});
