const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const config = fs.readFileSync(path.join(root, 'capacitor.config.ts'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('Capacitor targets the static frontend and exposes reproducible Android commands', () => {
  assert.match(config, /webDir:\s*['"]frontend['"]/);
  assert.match(config, /appId:\s*['"]br\.com\.fitlifesync\.app['"]/);
  assert.equal(packageJson.scripts['mobile:sync'], 'npx cap sync android');
  assert.equal(packageJson.scripts['mobile:build:android'], 'npm run mobile:sync && cd android && gradlew.bat assembleDebug');
});
