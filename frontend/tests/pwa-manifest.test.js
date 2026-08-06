const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

test('PWA manifest and service worker comply with offline static caching requirements', () => {
  const manifestPath = path.join(root, 'frontend/manifest.webmanifest');
  assert.equal(fs.existsSync(manifestPath), true, 'manifest.webmanifest must exist');
  
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.name, 'FitLife Sync');
  assert.equal(manifest.short_name, 'FitLife');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.theme_color, '#0f172a');
  assert.equal(Array.isArray(manifest.icons), true);
  assert.equal(manifest.icons.length >= 2, true);

  const icon192 = path.join(root, 'frontend/icons/icon-192.png');
  const icon512 = path.join(root, 'frontend/icons/icon-512.png');
  assert.equal(fs.existsSync(icon192), true, '192x192 icon must exist');
  assert.equal(fs.existsSync(icon512), true, '512x512 icon must exist');

  const swPath = path.join(root, 'frontend/sw.js');
  assert.equal(fs.existsSync(swPath), true, 'sw.js service worker file must exist');
  const swCode = fs.readFileSync(swPath, 'utf8');

  assert.match(swCode, /CACHE_NAME\s*=/);
  assert.match(swCode, /addEventListener\(['"]install['"]/);
  assert.match(swCode, /addEventListener\(['"]activate['"]/);
  assert.match(swCode, /addEventListener\(['"]fetch['"]/);
  assert.match(swCode, /\/api\//, 'Service worker must explicitly bypass /api/ endpoints');

  const indexHtml = fs.readFileSync(path.join(root, 'frontend/index.html'), 'utf8');
  const desktopHtml = fs.readFileSync(path.join(root, 'frontend/desktop.html'), 'utf8');
  const mobileHtml = fs.readFileSync(path.join(root, 'frontend/mobile.html'), 'utf8');

  for (const html of [indexHtml, desktopHtml, mobileHtml]) {
    assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
    assert.match(html, /<meta name="theme-color" content="#0f172a">/);
    assert.match(html, /<meta name="mobile-web-app-capable" content="yes">/);
    assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes">/);
  }

  const nginxConf = fs.readFileSync(path.join(root, 'nginx.conf'), 'utf8');
  assert.match(nginxConf, /location = \/sw\.js/);
  assert.match(nginxConf, /location = \/manifest\.webmanifest/);
  assert.match(nginxConf, /Service-Worker-Allowed/);

  const appJs = fs.readFileSync(path.join(root, 'frontend/js/app.js'), 'utf8');
  assert.match(appJs, /registerServiceWorker/);
});
