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

test('pages load local routing, icons and event scripts', () => {
  assert.ok(fs.statSync(path.join(frontendRoot, 'vendor/lucide/lucide-1.25.0.min.js')).size > 0);
  assert.ok(fs.statSync(path.join(frontendRoot, 'vendor/lucide/LICENSE')).size > 0);
  assert.match(read('index.html'), /<script src="js\/router\.js\?v=[^"]+" defer><\/script>/);
  assert.match(read('desktop.html'), /<script src="vendor\/lucide\/lucide-1\.25\.0\.min\.js"><\/script>/);
  assert.match(read('mobile.html'), /<script src="vendor\/lucide\/lucide-1\.25\.0\.min\.js"><\/script>/);
  assert.match(read('desktop.html'), /<script src="js\/events\.js\?v=[^"]+"><\/script>/);
  assert.match(read('mobile.html'), /<script src="js\/events\.js\?v=[^"]+"><\/script>/);
  assert.doesNotMatch(read('desktop.html'), /unpkg\.com|lucide@latest/);
  assert.doesNotMatch(read('mobile.html'), /unpkg\.com|lucide@latest/);
});

test('local CSS and JavaScript assets use one cache-busting release version', () => {
  const versions = new Set();

  for (const filename of htmlFiles) {
    const html = read(filename);
    const assets = [...html.matchAll(/(?:src|href)="((?:css|js)\/[^"]+)"/g)];
    for (const [, asset] of assets) {
      const version = new URLSearchParams(asset.split('?')[1] || '').get('v');
      assert.ok(version, `${filename} has an unversioned local asset: ${asset}`);
      versions.add(version);
    }
  }

  assert.equal(versions.size, 1, 'local assets must share the same release version');
});

test('Nginx script policy rejects inline JavaScript', () => {
  const nginx = fs.readFileSync(path.join(repositoryRoot, 'nginx.conf'), 'utf8');
  const policy = nginx.match(/Content-Security-Policy "([^"]+)"/)?.[1];
  assert.ok(policy, 'Content-Security-Policy header is missing');

  const scriptSource = policy.match(/script-src ([^;]+)/)?.[1];
  assert.ok(scriptSource, 'script-src directive is missing');
  assert.match(scriptSource, /'self'/);
  assert.doesNotMatch(scriptSource, /https?:/);
  assert.doesNotMatch(scriptSource, /'unsafe-inline'/);
});

test('Nginx request limit matches the bounded embedded image payload', () => {
  const nginx = fs.readFileSync(path.join(repositoryRoot, 'nginx.conf'), 'utf8');
  assert.match(nginx, /client_max_body_size 600k;/);
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

test('authentication forms expose loading, inline error and password visibility controls', () => {
  for (const page of ['desktop.html', 'mobile.html']) {
    const html = fs.readFileSync(path.join(frontendRoot, page), 'utf8');
    assert.equal((html.match(/data-action="toggle-password"/g) || []).length, 2);
    assert.equal((html.match(/role="alert" aria-live="assertive"/g) || []).length, 2);
    assert.equal((html.match(/data-submit-label/g) || []).length, 2);
  }

  const input = { type: 'password' };
  const icon = { setAttribute(name, value) { this[name] = value; } };
  const attributes = {};
  const button = {
    dataset: { target: 'login-password' },
    setAttribute(name, value) { attributes[name] = value; },
    querySelector() { return icon; }
  };
  const context = {
    console,
    document: {
      addEventListener() {},
      getElementById(id) { return id === 'login-password' ? input : null; },
      querySelector() { return null; }
    },
    lucide: { createIcons() {} }
  };

  vm.runInNewContext(read(path.join('js', 'app.js')), context);
  context.togglePasswordVisibility(button);
  assert.equal(input.type, 'text');
  assert.equal(attributes['aria-pressed'], 'true');
  assert.equal(attributes['aria-label'], 'Ocultar senha');
  assert.equal(icon['data-lucide'], 'eye-off');
});

test('login submission blocks duplicates and restores the form after an API error', async () => {
  let rejectLogin;
  let apiCalls = 0;
  const classes = new Set(['hidden']);
  const label = { textContent: 'Acessar Painel' };
  const submitButton = {
    dataset: { defaultLabel: 'Acessar Painel', loadingLabel: 'Entrando...' },
    disabled: false,
    classList: { toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); } },
    querySelector() { return label; }
  };
  const form = {
    id: 'login-form',
    dataset: {},
    setAttribute(name, value) { this[name] = value; },
    querySelector() { return submitButton; }
  };
  const error = {
    textContent: '',
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); }
    }
  };
  const nodes = {
    'login-email': { value: 'person@example.com' },
    'login-password': { value: 'secret-password' },
    'login-form-error': error
  };
  const context = {
    API: {
      post() {
        apiCalls += 1;
        return new Promise((resolve, reject) => { rejectLogin = reject; });
      }
    },
    console,
    document: {
      addEventListener() {},
      getElementById(id) { return nodes[id] || null; },
      querySelector() { return null; }
    },
    lucide: { createIcons() {} }
  };

  vm.runInNewContext(read(path.join('js', 'app.js')), context);
  context.showToast = () => {};
  const firstSubmit = context.handleLogin({ preventDefault() {}, target: form });
  const duplicateSubmit = context.handleLogin({ preventDefault() {}, target: form });

  assert.equal(apiCalls, 1);
  assert.equal(submitButton.disabled, true);
  assert.equal(label.textContent, 'Entrando...');
  await duplicateSubmit;

  rejectLogin(new Error('Credenciais inválidas'));
  await firstSubmit;

  assert.equal(submitButton.disabled, false);
  assert.equal(form.dataset.submitting, 'false');
  assert.equal(label.textContent, 'Acessar Painel');
  assert.equal(error.textContent, 'Credenciais inválidas');
  assert.equal(classes.has('hidden'), false);
});

test('chat exposes connection and delivery feedback without parallel retry timers', () => {
  const api = read(path.join('js', 'api.js'));
  const app = read(path.join('js', 'app.js'));
  const personal = read(path.join('js', 'personal.js'));
  const student = read(path.join('js', 'student.js'));

  assert.match(api, /chatStream\.onopen/);
  assert.match(app, /connected: 'Conectado'/);
  assert.match(app, /reconnecting: 'Reconectando\.\.\.'/);
  const connectionOrchestrator = app.match(/function connectRealTimeUpdates[\s\S]*?\n}\n\nif \(typeof window/)?.[0];
  assert.ok(connectionOrchestrator);
  assert.doesNotMatch(connectionOrchestrator, /setTimeout/);
  assert.match(personal, /setChatSendState\(form, 'sending'/);
  assert.match(personal, /setChatSendState\(form, 'failed'/);
  assert.match(student, /setChatSendState\(form, 'sending'/);
  assert.match(student, /setChatSendState\(form, 'failed'/);

  for (const page of ['desktop.html', 'mobile.html']) {
    const html = read(page);
    assert.equal((html.match(/data-chat-status/g) || []).length, 2);
    assert.equal((html.match(/data-chat-send-status/g) || []).length, 2);
  }
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
