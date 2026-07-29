import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../../', import.meta.url);
const config = fs.readFileSync(new URL('capacitor.config.ts', root), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(new URL('package.json', root), 'utf8'));

test('Capacitor targets the static frontend and exposes reproducible Android commands', () => {
  assert.match(config, /webDir:\s*['"]frontend['"]/);
  assert.match(config, /appId:\s*['"]br\.com\.fitlifesync\.app['"]/);
  assert.equal(packageJson.scripts['mobile:sync'], 'npx cap sync android');
  assert.equal(packageJson.scripts['mobile:build:android'], 'npm run mobile:sync && cd android && gradlew.bat assembleDebug');
});
