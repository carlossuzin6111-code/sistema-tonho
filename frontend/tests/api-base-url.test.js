const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const api = fs.readFileSync('frontend/js/api.js', 'utf8');

test('API client preserves same-origin web routing and validates native HTTPS configuration', () => {
  assert.match(api, /isNativeCapacitor/);
  assert.match(api, /return '\/api'/);
  assert.match(api, /__FITLIFE_API_BASE_URL__/);
  assert.match(api, /url\.protocol !== 'https:'/);
  assert.match(api, /API_CREDENTIALS = isNativeCapacitor \? 'include' : 'same-origin'/);
});
