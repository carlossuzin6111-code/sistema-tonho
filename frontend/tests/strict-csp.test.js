const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const frontendRoot = path.join(__dirname, '..');
const repositoryRoot = path.join(frontendRoot, '..');
const htmlFiles = ['index.html', 'desktop.html', 'mobile.html'];

function read(relativePath) {
  return fs.readFileSync(path.join(frontendRoot, relativePath), 'utf8');
}

test('HTML contains no inline scripts or event handler attributes', () => {
  for (const filename of htmlFiles) {
    const html = read(filename);
    assert.doesNotMatch(html, /\son[a-z]+\s*=/i, `${filename} contains an inline event handler`);
    assert.doesNotMatch(
      html,
      /<script\b(?![^>]*\bsrc\s*=)[^>]*>/i,
      `${filename} contains an inline script block`
    );
  }
});

test('every declarative action is present in the event allowlist', () => {
  const eventsSource = read(path.join('js', 'events.js'));
  const actions = new Set();

  for (const filename of ['desktop.html', 'mobile.html']) {
    const html = read(filename);
    for (const match of html.matchAll(/data-action="([a-z-]+)"/g)) actions.add(match[1]);
  }

  for (const action of actions) {
    assert.match(eventsSource, new RegExp(`['"]${action}['"]\\s*:`), `${action} is not allowlisted`);
  }
});

test('pages load external routing and event scripts', () => {
  assert.match(read('index.html'), /<script src="js\/router\.js" defer><\/script>/);
  assert.match(read('desktop.html'), /<script src="js\/events\.js"><\/script>/);
  assert.match(read('mobile.html'), /<script src="js\/events\.js"><\/script>/);
});

test('Nginx script policy rejects inline JavaScript', () => {
  const nginx = fs.readFileSync(path.join(repositoryRoot, 'nginx.conf'), 'utf8');
  const policy = nginx.match(/Content-Security-Policy "([^"]+)"/)?.[1];
  assert.ok(policy, 'Content-Security-Policy header is missing');

  const scriptSource = policy.match(/script-src ([^;]+)/)?.[1];
  assert.ok(scriptSource, 'script-src directive is missing');
  assert.match(scriptSource, /'self'/);
  assert.match(scriptSource, /https:\/\/unpkg\.com/);
  assert.doesNotMatch(scriptSource, /'unsafe-inline'/);
});

test('proxy forwarding uses one canonical client IP and local-only host access', () => {
  const nginx = fs.readFileSync(path.join(repositoryRoot, 'nginx.conf'), 'utf8');
  const compose = fs.readFileSync(path.join(repositoryRoot, 'docker-compose.yml'), 'utf8');

  assert.match(nginx, /map \$http_cf_connecting_ip \$forwarded_client_ip/);
  assert.match(nginx, /proxy_set_header X-Forwarded-For \$forwarded_client_ip/);
  assert.doesNotMatch(nginx, /\$proxy_add_x_forwarded_for/);
  assert.match(compose, /127\.0\.0\.1:3000:3000/);
});

test('registration keys use the transactional database flow only', () => {
  const compose = fs.readFileSync(path.join(repositoryRoot, 'docker-compose.yml'), 'utf8');
  const readme = fs.readFileSync(path.join(repositoryRoot, 'README.md'), 'utf8');
  const gitignore = fs.readFileSync(path.join(repositoryRoot, '.gitignore'), 'utf8');

  assert.doesNotMatch(compose, /keys_aut\.json/);
  assert.doesNotMatch(readme, /Copie `backend\/keys_aut\.example\.json`/);
  assert.match(readme, /docker compose exec app npm run access-key:create/);
  assert.match(gitignore, /^keys_aut\.json$/m);
  assert.match(gitignore, /^\*\.sqlite$/m);
  assert.equal(fs.existsSync(path.join(repositoryRoot, 'backend', 'keys_aut.example.json')), false);
});

test('Compose gates dependent services on API and Nginx health', () => {
  const compose = fs.readFileSync(path.join(repositoryRoot, 'docker-compose.yml'), 'utf8');
  const backend = fs.readFileSync(path.join(repositoryRoot, 'backend', 'src', 'index.js'), 'utf8');

  assert.match(backend, /app\.get\('\/api\/health'/);
  assert.match(backend, /await db\.raw\('SELECT 1'\)/);
  assert.match(compose, /fetch\('http:\/\/127\.0\.0\.1:3000\/api\/health'\)/);
  assert.match(compose, /wget.*http:\/\/127\.0\.0\.1:3000\//);
  assert.equal((compose.match(/condition: service_healthy/g) || []).length, 3);
});

test('public Compose stack defaults application services to production', () => {
  const compose = fs.readFileSync(path.join(repositoryRoot, 'docker-compose.yml'), 'utf8');
  const productionDefaults = compose.match(/NODE_ENV=\$\{NODE_ENV:-production\}/g) || [];

  assert.equal(productionDefaults.length, 2);
  assert.doesNotMatch(compose, /NODE_ENV=\$\{NODE_ENV:-development\}/);
});

test('modal controller provides dialog semantics and keyboard focus management', () => {
  const app = fs.readFileSync(path.join(frontendRoot, 'js', 'app.js'), 'utf8');

  assert.match(app, /setAttribute\('role', 'dialog'\)/);
  assert.match(app, /setAttribute\('aria-modal', 'true'\)/);
  assert.match(app, /setAttribute\('aria-hidden', 'false'\)/);
  assert.match(app, /event\.key === 'Escape'/);
  assert.match(app, /event\.key !== 'Tab'/);
  assert.match(app, /lastModalTrigger\.focus\(\)/);
});

test('event delegation invokes only the allowlisted action and form handlers', () => {
  const listeners = {};
  const calls = [];
  const context = {
    document: {
      addEventListener(type, handler) {
        listeners[type] = handler;
      },
      getElementById() {
        return null;
      }
    },
    switchAuthTab(tab) {
      calls.push(['switchAuthTab', tab]);
    },
    handleLogin(event) {
      calls.push(['handleLogin', event.target.id]);
    }
  };

  vm.runInNewContext(read(path.join('js', 'events.js')), context);

  let prevented = false;
  listeners.click({
    target: {
      closest() {
        return { dataset: { action: 'switch-auth-tab', tab: 'register' } };
      }
    },
    preventDefault() {
      prevented = true;
    }
  });
  listeners.submit({ target: { id: 'login-form' } });

  assert.equal(prevented, true);
  assert.deepEqual(calls, [
    ['switchAuthTab', 'register'],
    ['handleLogin', 'login-form']
  ]);
});
