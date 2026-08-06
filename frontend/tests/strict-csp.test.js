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

test('icon-only buttons expose an explicit accessible name', () => {
  for (const filename of ['desktop.html', 'mobile.html']) {
    const html = read(filename);
    const buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)];
    for (const [, attributes, content] of buttons) {
      if (!/data-lucide=/i.test(content)) continue;
      const visibleText = content.replace(/<[^>]+>/g, '').trim();
      if (visibleText) continue;
      assert.match(attributes, /aria-label="[^"]+"/i, `${filename} has an unnamed icon-only button`);
    }
  }

  const personal = read(path.join('js', 'personal.js'));
  assert.match(personal, /'aria-label': `Remover \$\{ex\.name\} do treino`/);
  assert.match(personal, /'aria-label': `Visualizar execução de \$\{ex\.name\}`/);
  assert.match(personal, /'aria-label': `Excluir \$\{ex\.name\} da biblioteca`/);
});

test('visible form controls expose an associated label or accessible name', () => {
  for (const filename of ['desktop.html', 'mobile.html']) {
    const html = read(filename);
    for (const match of html.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)) {
      const attributes = match[2];
      if (/type="hidden"/i.test(attributes)) continue;
      const id = attributes.match(/\bid="([^"]+)"/i)?.[1];
      assert.ok(id, `${filename} has a visible control without id`);
      const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const hasLabel = new RegExp(`<label[^>]*for=["']${escapedId}["']`, 'i').test(html);
      assert.ok(hasLabel || /aria-label="[^"]+"/i.test(attributes), `${filename}#${id} has no accessible name`);
    }
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

test('Nginx policy rejects inline JavaScript and CSS', () => {
  const nginx = fs.readFileSync(path.join(repositoryRoot, 'nginx.conf'), 'utf8');
  const policy = nginx.match(/Content-Security-Policy "([^"]+)"/)?.[1];
  assert.ok(policy, 'Content-Security-Policy header is missing');

  const scriptSource = policy.match(/script-src ([^;]+)/)?.[1];
  assert.ok(scriptSource, 'script-src directive is missing');
  assert.match(scriptSource, /'self'/);
  assert.doesNotMatch(scriptSource, /https?:/);
  assert.doesNotMatch(scriptSource, /'unsafe-inline'/);

  const styleSource = policy.match(/style-src ([^;]+)/)?.[1];
  assert.ok(styleSource, 'style-src directive is missing');
  assert.equal(styleSource.trim(), "'self'");
  assert.doesNotMatch(styleSource, /'unsafe-inline'/);

  const fontSource = policy.match(/font-src ([^;]+)/)?.[1];
  assert.ok(fontSource, 'font-src directive is missing');
  assert.equal(fontSource.trim(), "'self'");

  const imageSource = policy.match(/img-src ([^;]+)/)?.[1];
  assert.equal(imageSource.trim(), "'self' data: https://raw.githubusercontent.com");

  for (const filename of htmlFiles) {
    const html = read(filename);
    assert.doesNotMatch(html, /\sstyle=/i, `${filename} has an inline style attribute`);
    assert.doesNotMatch(html, /<style\b/i, `${filename} has an inline style block`);
    assert.doesNotMatch(html, /fonts\.(?:googleapis|gstatic)\.com/i, `${filename} loads a remote font`);
  }
  for (const filename of ['app.js', 'events.js', 'personal.js', 'student.js', 'safe-dom.js']) {
    const source = read(path.join('js', filename));
    assert.doesNotMatch(source, /\.style\.|style\s*:\s*\{/i, `${filename} creates an inline style`);
  }
});

test('Nginx publishes one canonical copy of overlapping security headers', () => {
  const nginx = fs.readFileSync(path.join(repositoryRoot, 'nginx.conf'), 'utf8');
  const canonicalHeaders = [
    'Cross-Origin-Opener-Policy',
    'Permissions-Policy',
    'Referrer-Policy',
    'X-Content-Type-Options',
    'X-Frame-Options'
  ];

  for (const header of canonicalHeaders) {
    assert.match(nginx, new RegExp(`proxy_hide_header ${header};`, 'i'));
    assert.equal((nginx.match(new RegExp(`add_header ${header} `, 'gi')) || []).length, 1);
  }
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
  const healthController = fs.readFileSync(path.join(repositoryRoot, 'backend', 'src', 'controllers', 'healthController.js'), 'utf8');

  assert.match(backend, /app\.get\('\/api\/health'/);
  assert.match(backend, /app\.get\('\/health\/live'/);
  assert.match(backend, /app\.get\('\/health\/ready'/);
  assert.match(healthController, /await db\.raw\('SELECT 1'\)/);
  assert.match(healthController, /db\.migrate\.list\(\)/);
  assert.match(compose, /fetch\('http:\/\/127\.0\.0\.1:3000\/health\/ready'\)/);
  assert.match(compose, /wget.*http:\/\/127\.0\.0\.1:3000\//);
  assert.equal((compose.match(/condition: service_healthy/g) || []).length, 4);
});

test('automatic backup worker shares the database volume with bounded retention', () => {
  const compose = fs.readFileSync(path.join(repositoryRoot, 'docker-compose.yml'), 'utf8');
  assert.match(compose, /backup-worker:[\s\S]*command: npm run worker:backup/);
  assert.match(compose, /backup-worker:[\s\S]*BACKUP_INTERVAL_MS=\$\{BACKUP_INTERVAL_MS:-86400000\}/);
  assert.match(compose, /backup-worker:[\s\S]*BACKUP_RETENTION=\$\{BACKUP_RETENTION:-7\}/);
  assert.match(compose, /backup-worker:[\s\S]*- db-data:\/app\/data/);
});

test('public Compose stack defaults application services to production', () => {
  const compose = fs.readFileSync(path.join(repositoryRoot, 'docker-compose.yml'), 'utf8');
  const productionDefaults = compose.match(/NODE_ENV=\$\{NODE_ENV:-production\}/g) || [];

  assert.equal(productionDefaults.length, 3);
  assert.doesNotMatch(compose, /NODE_ENV=\$\{NODE_ENV:-development\}/);
});

test('backend runtime image is multi-stage, non-root and excludes build tools', () => {
  const dockerfile = fs.readFileSync(path.join(repositoryRoot, 'backend', 'Dockerfile'), 'utf8');
  const runtimeStage = dockerfile.split(/FROM node:20-slim@sha256:[a-f0-9]{64} AS runtime/)[1];

  assert.match(dockerfile, /FROM node:20-slim@sha256:[a-f0-9]{64} AS dependencies/);
  assert.ok(runtimeStage, 'runtime stage is missing');
  assert.match(runtimeStage, /COPY --from=dependencies --chown=node:node/);
  assert.match(runtimeStage, /COPY --chown=node:node \. \./);
  assert.match(runtimeStage, /USER node/);
  assert.doesNotMatch(runtimeStage, /apt-get|python3|make|g\+\+/);
});

test('all external container images are pinned to immutable digests', () => {
  const dockerfile = fs.readFileSync(path.join(repositoryRoot, 'backend', 'Dockerfile'), 'utf8');
  const compose = fs.readFileSync(path.join(repositoryRoot, 'docker-compose.yml'), 'utf8');
  const dockerfileImages = [...dockerfile.matchAll(/^FROM\s+(\S+)/gm)].map(match => match[1]);
  const composeImages = [...compose.matchAll(/^\s+image:\s+(\S+)/gm)].map(match => match[1]);
  const images = [...dockerfileImages, ...composeImages];

  assert.ok(images.length >= 4);
  for (const image of images) assert.match(image, /@sha256:[a-f0-9]{64}$/);
});

test('CI workflow enforces mandatory PR execution, migration status validation, and dependency security audits', () => {
  const workflow = fs.readFileSync(path.join(repositoryRoot, '.github', 'workflows', 'backend-tests.yml'), 'utf8');

  assert.match(workflow, /on:\s*[\r\n]+\s*pull_request:/);
  assert.match(workflow, /npm run migrate:status/);
  assert.match(workflow, /npm audit --omit=dev/);
  assert.match(workflow, /npm audit/);
  assert.match(workflow, /gitleaks\/gitleaks:v8\.30\.1/);
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
    assert.equal((html.match(/data-action="toggle-password"/g) || []).length, 11);
    assert.equal((html.match(/role="alert" aria-live="assertive"/g) || []).length, 16);
    assert.equal((html.match(/data-submit-label/g) || []).length, 16);
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

test('authentication screens identify the public test environment', () => {
  for (const page of ['desktop.html', 'mobile.html']) {
    const html = read(page);
    assert.match(html, /class="test-environment-notice"[^>]*role="note"/);
    assert.match(html, /Ambiente público de testes\./);
    assert.match(html, /Não use dados pessoais reais\./);
  }

  const css = read(path.join('css', 'style.css'));
  assert.match(css, /\.test-environment-notice\s*\{/);
  assert.match(css, /body\.dark-theme \.test-environment-notice/);
});

test('student password reset uses an accessible confirmed form instead of a browser prompt', () => {
  for (const page of ['desktop.html', 'mobile.html']) {
    const html = fs.readFileSync(path.join(frontendRoot, page), 'utf8');
    assert.match(html, /id="modal-reset-password"[^>]*data-return-modal="modal-student-detail"/);
    assert.match(html, /id="reset-password-form"/);
    assert.match(html, /id="reset-student-password"[^>]*minlength="10"[^>]*maxlength="128"/);
    assert.match(html, /id="reset-student-password-confirm"[^>]*minlength="10"[^>]*maxlength="128"/);
    assert.match(html, /id="reset-password-form-error"[^>]*role="alert"/);
  }

  const personal = read(path.join('js', 'personal.js'));
  const events = read(path.join('js', 'events.js'));
  assert.doesNotMatch(personal, /\bprompt\s*\(/);
  assert.match(personal, /newPassword !== confirmation/);
  assert.match(personal, /setFormSubmitting\(form, true\)/);
  assert.match(personal, /setFormError\(form\.id, err\.message\)/);
  assert.match(events, /'reset-password-form': event => handleResetPasswordSubmit\(event\)/);
});

test('destructive actions use an accessible contextual confirmation flow', () => {
  for (const page of ['desktop.html', 'mobile.html']) {
    const html = fs.readFileSync(path.join(frontendRoot, page), 'utf8');
    assert.match(html, /id="modal-destructive-confirmation"/);
    assert.match(html, /id="destructive-confirmation-form"/);
    assert.match(html, /id="destructive-confirmation-form-error"[^>]*role="alert"/);
    assert.match(html, /data-loading-label="Excluindo\.\.\."/);
  }

  const app = read(path.join('js', 'app.js'));
  const personal = read(path.join('js', 'personal.js'));
  const events = read(path.join('js', 'events.js'));
  assert.doesNotMatch(personal, /\bconfirm\s*\(/);
  assert.equal((personal.match(/openDestructiveConfirmation\(\{/g) || []).length, 5);
  assert.match(app, /setFormError\(form\.id, err\.message\)/);
  assert.match(app, /if \(typeof afterClose === 'function'\)/);
  assert.match(events, /'destructive-confirmation-form': event => handleDestructiveConfirmationSubmit\(event\)/);
});

test('internal creation forms block duplicate submissions and announce local errors', () => {
  const formIds = [
    'create-student-form',
    'create-workout-form',
    'add-exercise-form',
    'add-measurement-form',
    'create-catalog-exercise-form'
  ];

  for (const page of ['desktop.html', 'mobile.html']) {
    const html = fs.readFileSync(path.join(frontendRoot, page), 'utf8');
    for (const formId of formIds) {
      assert.match(html, new RegExp(`id="${formId}"[^>]*class="form-with-feedback"`));
      assert.match(html, new RegExp(`id="${formId}-error"[^>]*role="alert"`));
    }
    assert.equal((html.match(/data-loading-label=/g) || []).length >= 9, true);
  }

  const app = read(path.join('js', 'app.js'));
  const personal = read(path.join('js', 'personal.js'));
  const events = read(path.join('js', 'events.js'));
  assert.match(app, /handleAddMeasurementSubmit[\s\S]*form\.dataset\.submitting === 'true'/);
  assert.equal((personal.match(/form\.dataset\.submitting === 'true'/g) || []).length >= 5, true);
  assert.match(events, /\.auth-form, \.form-with-feedback/);
});

test('mobile primary actions remain reachable without viewport overflow', () => {
  const html = fs.readFileSync(path.join(frontendRoot, 'mobile.html'), 'utf8');
  const css = fs.readFileSync(path.join(frontendRoot, 'css', 'mobile.css'), 'utf8');

  assert.equal((html.match(/mobile-sticky-action/g) || []).length, 2);
  assert.match(css, /\.mobile-section-actions\s*\{[^}]*position:\s*sticky/);
  assert.match(css, /\.mobile-sticky-action\s*\{[^}]*position:\s*sticky/);
  assert.match(css, /\.modal-content\s*\{[^}]*height:\s*100dvh\s*!important/);
  assert.doesNotMatch(css, /\.modal-content\s*\{[^}]*width:\s*100vw/);
});

test('mobile student detail keeps profile geometry stable and content separated', () => {
  const html = read('mobile.html');
  const mobileCss = read(path.join('css', 'mobile.css'));
  const baseCss = read(path.join('css', 'style.css'));

  assert.match(html, /student-detail-close-row/);
  assert.match(html, /mobile-student-detail-tabs/);
  assert.match(mobileCss, /\.mobile-modal-profile \.avatar-large\s*\{[^}]*flex:\s*0 0 64px/);
  assert.match(mobileCss, /\.mobile-modal-profile \.modal-profile-info\s*\{[^}]*min-width:\s*0/);
  assert.match(mobileCss, /\.mobile-modal-body\s*\{[^}]*min-height:\s*0/);
  assert.match(mobileCss, /\.modal-content\s*\{[^}]*overflow:\s*hidden/);
  assert.match(baseCss, /\.avatar-large img\s*\{[^}]*object-fit:\s*cover/);
});

test('mobile student detail content reflows cards and statistics without overlap', () => {
  const html = read('mobile.html');
  const css = read(path.join('css', 'mobile.css'));

  assert.match(html, /id="modal-weight-chart-container" class="chart-container-svg mobile-chart-preview"/);
  assert.match(html, /id="modal-latest-metrics-grid" class="metrics-grid mobile-metrics-grid"/);
  assert.match(css, /\.mobile-modal-body \.workout-header\s*\{[^}]*flex-direction:\s*column/);
  assert.match(css, /\.mobile-modal-body \.inline-actions\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.mobile-modal-body \.exercise-stats\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.mobile-modal-body \.exercise-row-info\s*\{[^}]*min-width:\s*0/);
  assert.match(css, /\.mobile-modal-body \.table-container\s*\{[^}]*max-width:\s*100%/);
});

test('mobile chats fill available space and switch cleanly between threads and messages', () => {
  const html = read('mobile.html');
  const css = read(path.join('css', 'mobile.css'));

  assert.match(html, /id="tab-p-chat" class="tab-pane mobile-chat-tab"/);
  assert.match(html, /class="chat-container personal-chat-container"/);
  assert.match(html, /id="tab-s-chat" class="tab-pane mobile-chat-tab"/);
  assert.doesNotMatch(css, /personal-chat-messages\s*\{[^}]*height:\s*300px/);
  assert.doesNotMatch(css, /student-chat-container\s*\{[^}]*height:\s*400px/);
  assert.match(css, /\.mobile-chat-tab\.active\s*\{[^}]*height:\s*100%[^}]*min-height:\s*0[^}]*display:\s*flex\s*!important/);
  assert.match(css, /\.personal-chat-container:not\(\.show-window\) \.chat-window\s*\{[^}]*display:\s*none/);
  assert.match(css, /\.personal-chat-container\.show-window #chat-students-list\s*\{[^}]*display:\s*none/);
  assert.match(css, /\.chat-input-form\s*\{[^}]*padding-bottom:\s*max\(10px, env\(safe-area-inset-bottom\)\)/);
});

test('weight charts expose a textual trend with period, units and variation', () => {
  const personal = read(path.join('js', 'personal.js'));
  const css = read(path.join('css', 'style.css'));

  assert.match(personal, /function describeWeightTrend\(dataPoints\)/);
  assert.match(personal, /Variação de \$\{signedDifference\} kg/);
  assert.match(personal, /role: 'img'/);
  assert.match(personal, /'aria-label': trendSummary/);
  assert.match(personal, /className: 'chart-trend-summary'/);
  assert.match(css, /\.chart-trend-summary\s*\{/);
});

test('measurement histories use valid accessible tables on desktop and mobile', () => {
  for (const page of ['desktop.html', 'mobile.html']) {
    const html = read(page);
    assert.equal((html.match(/<caption class="table-caption">/g) || []).length, 2);
    assert.equal((html.match(/id="modal-measurements-table-body"/g) || []).length, 1);
    assert.match(html, /<table[^>]*>[\s\S]*?<tbody id="modal-measurements-table-body"[\s\S]*?<\/table>/);
  }

  const mobile = read('mobile.html');
  const mobileCss = read(path.join('css', 'mobile.css'));
  assert.equal((mobile.match(/class="data-table measurement-history-table"/g) || []).length, 2);
  assert.equal((mobile.match(/<th scope="col">/g) || []).length >= 14, true);
  assert.match(mobileCss, /\.measurement-history-table\s*\{[^}]*min-width:\s*720px/);
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

test('card loading states use accessible reduced-motion skeletons', () => {
  const app = read(path.join('js', 'app.js'));
  const personal = read(path.join('js', 'personal.js'));
  const student = read(path.join('js', 'student.js'));
  const css = read(path.join('css', 'style.css'));
  assert.match(app, /function renderLoadingSkeletons/);
  assert.match(app, /setAttribute\('aria-busy', 'true'\)/);
  assert.match(app, /setAttribute\('aria-busy', 'false'\)/);
  assert.equal((personal.match(/renderLoadingSkeletons\(/g) || []).length, 3);
  assert.equal((student.match(/renderLoadingSkeletons\(/g) || []).length, 1);
  assert.match(css, /@keyframes skeleton-shimmer/);
  assert.match(css, /prefers-reduced-motion: reduce[^}]*skeleton-card::after/s);
});

test('primary empty states offer direct contextual actions', () => {
  const app = read(path.join('js', 'app.js'));
  const personal = read(path.join('js', 'personal.js'));
  const student = read(path.join('js', 'student.js'));
  assert.match(app, /function appendEmptyStateAction/);
  assert.match(app, /on: \{ click: onClick \}/);
  assert.match(personal, /Cadastrar primeiro aluno/);
  assert.match(personal, /Criar primeira ficha/);
  assert.match(personal, /Criar primeiro exercício/);
  assert.match(student, /Conversar com meu personal/);
});

test('student and exercise searches are accessible, local and accent-insensitive', () => {
  for (const page of ['desktop.html', 'mobile.html']) {
    const html = read(page);
    assert.equal((html.match(/class="list-search-toolbar"/g) || []).length, 2);
    assert.equal((html.match(/role="status" aria-live="polite"/g) || []).length >= 6, true);
    assert.match(html, /id="students-search"[^>]+aria-label=/);
    assert.match(html, /id="exercises-search"[^>]+aria-label=/);
  }

  const context = {};
  vm.runInNewContext(read(path.join('js', 'personal.js')), context);
  assert.equal(context.normalizeListSearch('  Elevação PÉLVICA  '), 'elevacao pelvica');
  const filters = context.filterPersonalStudents.toString() + context.filterPersonalExercises.toString();
  assert.doesNotMatch(filters, /API\./);
});

test('student and exercise sorting is local, accessible and search-compatible', () => {
  for (const page of ['desktop.html', 'mobile.html']) {
    const html = read(page);
    assert.match(html, /id="students-sort"[^>]*aria-label="Ordenar alunos"/);
    assert.match(html, /id="exercises-sort"[^>]*aria-label="Ordenar exercícios"/);
  }
  const personal = read(path.join('js', 'personal.js'));
  const events = read(path.join('js', 'events.js'));
  assert.match(personal, /function sortPersonalStudents/);
  assert.match(personal, /Number\(b\.dataset\.unread\) - Number\(a\.dataset\.unread\)/);
  assert.match(personal, /localeCompare\(b\.dataset\.sortName, 'pt-BR'\)/);
  assert.match(personal, /filterPersonalStudents\(document\.getElementById\('students-search'\)\.value\)/);
  assert.match(events, /students-sort.*sortPersonalStudents/);
  assert.match(events, /exercises-sort.*sortPersonalExercises/);
});

test('student dashboard summarizes totals and unread messages without another request', () => {
  for (const page of ['desktop.html', 'mobile.html']) {
    const html = read(page);
    assert.match(html, /id="stat-total-students"[^>]*aria-live="polite"/);
    assert.match(html, /id="stat-unread-messages"[^>]*aria-live="polite"/);
  }
  const personal = read(path.join('js', 'personal.js'));
  assert.match(personal, /personalStudents\.reduce\(\(total, student\) => total \+ \(student\.unread_messages \|\| 0\), 0\)/);
  assert.match(personal, /getElementById\('stat-unread-messages'\)\.textContent = globalUnread/);
});

test('dashboard tabs use restorable history routes and preserve them through interface selection', () => {
  const calls = [];
  const context = {
    API: { getCurrentUser() { return null; } },
    document: { addEventListener() {} },
    window: {
      location: { hash: '#/personal/chat' },
      history: {
        pushState(...args) { calls.push(['push', ...args]); },
        replaceState(...args) { calls.push(['replace', ...args]); }
      },
      addEventListener() {}
    }
  };
  vm.runInNewContext(read(path.join('js', 'app.js')), context);

  assert.equal(context.tabFromDashboardRoute('personal'), 'chat');
  assert.equal(context.tabFromDashboardRoute('student'), null);
  context.window.location.hash = '';
  context.updateDashboardRoute('student', 'measurements', 'push');
  assert.equal(calls[0][0], 'push');
  assert.equal(calls[0][3], '#/student/measurements');

  const router = read(path.join('js', 'router.js'));
  assert.match(router, /interfaceFile.*window\.location\.hash/);
  const app = read(path.join('js', 'app.js'));
  assert.match(app, /addEventListener\('popstate', restoreDashboardRoute\)/);
  assert.match(app, /historyMode: 'none'/);
});

test('logout removes the private dashboard route from browser history', () => {
  const app = read(path.join('js', 'app.js'));
  assert.match(app, /API\.clearSession\(\);\s*window\.history\.replaceState\(null, '', window\.location\.pathname\);\s*showLoginScreen\(\)/);
});

test('dashboard and modal tabs expose state, panels and keyboard navigation', () => {
  for (const page of ['desktop.html', 'mobile.html']) {
    const html = read(page);
    assert.equal((html.match(/role="tablist"/g) || []).length, 5);
    assert.match(html, /aria-label="Áreas do personal"/);
    assert.match(html, /aria-label="Áreas do aluno"/);
    assert.match(html, /aria-label="Detalhes do aluno"/);
  }
  const app = read(path.join('js', 'app.js'));
  assert.match(app, /setAttribute\('aria-selected', String\(active\)\)/);
  assert.match(app, /panel\.hidden = !active/);
  assert.match(app, /'ArrowLeft'.*'ArrowRight'.*'Home'.*'End'/);
  assert.match(app, /target\.focus\(\);\s*target\.click\(\)/);
});

test('own profile UI is shared, accessible and prepares a bounded cropped avatar', () => {
  for (const page of ['desktop.html', 'mobile.html']) {
    const html = read(page);
    assert.match(html, /data-action="open-profile-modal"[^>]*aria-label="(?:Abrir meu perfil|Editar perfil)"/);
    assert.match(html, /id="modal-edit-profile"/);
    assert.match(html, /id="profile-avatar-file"[^>]*accept="image\/jpeg,image\/png,image\/webp"/);
    assert.match(html, /id="profile-avatar-zoom"[^>]*max="3"/);
    assert.match(html, /id="profile-email-readonly"[^>]*readonly/);
    assert.match(html, /id="profile-role-readonly"[^>]*readonly/);
    assert.match(html, /src="js\/profile\.js\?v=[^"]+"/);
  }

  const profile = read(path.join('js', 'profile.js'));
  const api = read(path.join('js', 'api.js'));
  assert.match(profile, /canvas\.toBlob\([^]*'image\/webp', 0\.82/);
  assert.match(profile, /blob\.size > 400000/);
  assert.match(profile, /naturalWidth > 4096/);
  assert.match(profile, /SafeDOM\.setSafeImageSource/);
  assert.doesNotMatch(profile, /innerHTML|onerror\s*=\s*["']/i);
  assert.match(api, /async patch\(endpoint, data\)/);
  assert.match(api, /async put\(endpoint, data\)/);
});

test('student flows use safe DOM, user-scoped progress and authorized partner metadata', () => {
  const student = read(path.join('js', 'student.js'));
  const personal = read(path.join('js', 'personal.js'));
  assert.doesNotMatch(student, /innerHTML/i);
  assert.match(student, /fitlife_chk_user_\$\{userId\}_exercise_\$\{exerciseId\}/);
  assert.match(student, /Promise\.all\(\[API\.get\(`\/chat\?limit=\$\{CHAT_PAGE_SIZE\}`\), API\.get\('\/chat\/partner'\)\]\)/);
  assert.match(student, /renderUserAvatar\(document\.getElementById\('student-chat-trainer-avatar'\), partner\)/);
  assert.match(student, /tableMessageRow\(`Erro ao carregar medidas:/);
  assert.match(student, /plotSvgChart\('weight-chart-container', \[\]\)/);
  assert.match(personal, /renderUserAvatar/);
});

test('student workouts preserve a semantic desktop table and become labeled mobile cards', () => {
  for (const page of ['desktop.html', 'mobile.html']) {
    const html = read(page);
    assert.match(html, /id="student-workout-count"[^>]*aria-live="polite"/);
    assert.match(html, /id="student-exercise-count"[^>]*aria-live="polite"/);
    assert.match(html, /id="student-completed-count"[^>]*aria-live="polite"/);
  }
  const student = read(path.join('js', 'student.js'));
  const app = read(path.join('js', 'app.js'));
  const mobile = read(path.join('css', 'mobile.css'));
  assert.match(student, /function updateStudentWorkoutSummary/);
  assert.match(student, /attrs: \{ 'data-label': 'Exercício' \}/);
  for (const label of ['Status', 'Séries', 'Repetições', 'Carga', 'Descanso', 'Execução']) {
    assert.match(student, new RegExp(`'data-label': '${label}'`));
  }
  assert.match(student, /appendEmptyStateAction\(container, \{ label: 'Tentar novamente'/);
  assert.match(app, /gifImg\.alt = name \? `Demonstração do exercício/);
  assert.match(mobile, /#tab-s-workouts \.pedagogical-table tbody tr[^}]*display: grid/s);
  assert.match(mobile, /content: attr\(data-label\)/);
  assert.match(mobile, /#tab-s-workouts \.workout-checkbox[^}]*width: 44px[^}]*height: 44px/s);
  assert.match(mobile, /#tab-s-workouts \.btn-pill-action[^}]*min-height: 44px/s);
  assert.doesNotMatch(mobile, /#tab-s-workouts[^{}]*\{[^}]*100vw/s);
});

test('student measurements are actionable, complete and responsive without losing table semantics', () => {
  for (const page of ['desktop.html', 'mobile.html']) {
    const html = read(page);
    assert.match(html, /data-modal="modal-add-measurement"[^>]*>[\s\S]*?Adicionar/);
    for (const id of ['student-latest-weight', 'student-weight-change', 'student-latest-measurement-date', 'student-measurement-count']) {
      assert.match(html, new RegExp(`id="${id}"[^>]*aria-live="polite"`));
    }
  }
  const desktop = read('desktop.html');
  assert.equal((desktop.match(/id="measurements-table"[\s\S]*?<th scope="col">/g) || []).length, 1);
  const mobileHtml = read('mobile.html');
  for (const id of ['meas-weight', 'meas-chest', 'meas-waist', 'meas-hips', 'meas-biceps-l', 'meas-biceps-r', 'meas-thigh-l', 'meas-thigh-r']) {
    assert.match(mobileHtml, new RegExp(`id="${id}"`));
  }
  const student = read(path.join('js', 'student.js'));
  const mobile = read(path.join('css', 'mobile.css'));
  assert.match(student, /function updateStudentMeasurementOverview/);
  assert.match(student, /latest\?\.weight === null \|\| latest\?\.weight === undefined/);
  for (const label of ['Data', 'Peso', 'Tórax', 'Cintura', 'Quadril', 'Bíceps E / D', 'Coxa E / D']) {
    assert.match(student, new RegExp(`'data-label': '${label}'`));
  }
  assert.match(student, /appendEmptyStateAction\(metricsGrid, \{ label: 'Tentar novamente'/);
  assert.match(mobile, /#tab-s-measurements \.measurement-history-table tbody tr[^}]*display: grid/s);
  assert.match(mobile, /#tab-s-measurements \.measurement-history-table td::before[^}]*content: attr\(data-label\)/s);
  assert.match(mobile, /#modal-add-measurement \.mobile-modal-inner[^}]*overflow-y: auto/s);
  assert.doesNotMatch(mobile, /#tab-s-measurements[^{}]*\.measurement-history-table[^{}]*\{[^}]*min-width:\s*720px/s);
});

test('student chat keeps only messages scrollable and offers bounded resilient sending', () => {
  for (const page of ['desktop.html', 'mobile.html']) {
    const html = read(page);
    assert.match(html, /id="student-chat-messages"[^>]*role="log"[^>]*aria-live="polite"/);
    assert.match(html, /id="student-chat-input"[^>]*maxlength="2000"[^>]*enterkeyhint="send"/);
    assert.match(html, /id="student-chat-trainer-avatar"/);
  }
  const style = read(path.join('css', 'style.css'));
  const mobile = read(path.join('css', 'mobile.css'));
  const app = read(path.join('js', 'app.js'));
  const events = read(path.join('js', 'events.js'));
  const student = read(path.join('js', 'student.js'));
  const personal = read(path.join('js', 'personal.js'));
  const controller = fs.readFileSync(path.join(repositoryRoot, 'backend', 'src', 'controllers', 'chatController.js'), 'utf8');
  assert.match(style, /\.chat-messages[^}]*overflow-y: auto[^}]*overflow-x: hidden/s);
  assert.match(style, /\.chat-bubble[^}]*overflow-wrap: anywhere[^}]*word-break: break-word/s);
  assert.match(style, /\.chat-input-form[^}]*grid-template-columns: minmax\(0, 1fr\) 44px/s);
  assert.match(style, /\.btn-chat-send[^}]*width: 44px[^}]*height: 44px/s);
  assert.match(mobile, /\.mobile-chat-tab > \.chat-container[^}]*height: auto[^}]*overflow: hidden/s);
  assert.match(mobile, /\.chat-input-form input[^}]*font-size: 16px/s);
  assert.match(app, /state === 'failed' \? 'Tentar enviar mensagem novamente'/);
  assert.match(events, /\['personal-chat-input', 'student-chat-input'\][^\n]*resetChatSendFeedback/);
  assert.match(student, /form\.dataset\.sendState === 'sending'/);
  assert.match(personal, /form\.dataset\.sendState === 'sending'/);
  assert.match(student, /appendEmptyStateAction\(box, \{ label: 'Tentar novamente'/);
  assert.match(controller, /message\.length > 2000/);
});

test('exercise catalog virtualizes large lists while keeping search and mobile layout hooks', () => {
  const personal = read(path.join('js', 'personal.js'));
  const style = read(path.join('css', 'style.css'));
  const mobile = read(path.join('css', 'mobile.css'));
  assert.match(personal, /CATALOG_VIRTUAL_BATCH\s*=\s*15/);
  assert.match(personal, /addEventListener\('scroll', renderWindow/);
  assert.match(personal, /replaceChildren\(\.\.\.filtered\.slice\(first, visible\)/);
  assert.match(style, /\.exercise-catalog-virtual-viewport[^}]*overflow-y:\s*auto/s);
  assert.match(style, /\.exercise-catalog-virtual-cards[^}]*grid-template-columns/s);
  assert.match(mobile, /\.exercise-catalog-virtual-cards[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
});

test('timestamps are parsed as UTC and formatted with the browser local timezone', () => {
  const datetime = read(path.join('js', 'datetime.js'));
  const personal = read(path.join('js', 'personal.js'));
  const student = read(path.join('js', 'student.js'));
  assert.match(datetime, /replace\(' ', 'T'\).*\}Z/s);
  assert.match(datetime, /new Intl\.DateTimeFormat\(undefined, options\)/);
  assert.match(datetime, /global\.AppDateTime/);
  assert.doesNotMatch(personal, /toLocaleDateString|toLocaleTimeString/);
  assert.doesNotMatch(student, /toLocaleDateString|toLocaleTimeString/);
  for (const page of ['desktop.html', 'mobile.html']) {
    assert.match(read(page), /js\/datetime\.js\?v=20260805\.5/);
  }
});

test('Nginx revalidates HTML and caches versioned CSS/JS immutably', () => {
  const nginx = fs.readFileSync(path.join(repositoryRoot, 'nginx.conf'), 'utf8');
  assert.match(nginx, /location ~\* \\.html\$[\s\S]*?Cache-Control "no-cache, must-revalidate"/);
  assert.match(nginx, /location ~\* \\.\(\?:css\|js\)\$[\s\S]*?Cache-Control "public, max-age=31536000, immutable"/);
  assert.match(nginx, /location ~\* \\.\(\?:css\|js\)\$[\s\S]*?try_files \$uri =404/);
});

test('all keyboard-focusable controls have a visible WCAG focus indicator', () => {
  const style = read(path.join('css', 'style.css'));
  assert.match(style, /:where\(button, a, input, select, textarea, \[tabindex\]\):focus-visible/);
  assert.match(style, /:where\(button, a, input, select, textarea, \[tabindex\]\):focus-visible[^}]*outline:\s*3px solid var\(--focus-ring\)/s);
  assert.match(style, /@media \(prefers-reduced-motion: reduce\)/);
});

test('final student-area audit prevents duplicate ids, empty image requests and inaccessible mobile navigation', () => {
  for (const page of ['desktop.html', 'mobile.html']) {
    const html = read(page);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
    const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    assert.deepEqual(duplicates, [], `${page} contains duplicate ids`);
    assert.doesNotMatch(html, /<img[^>]*\ssrc=""/i);
    for (const image of html.matchAll(/<img\b[^>]*>/gi)) assert.match(image[0], /\salt="[^"]*"/i);
  }
  const mobileHtml = read('mobile.html');
  const events = read(path.join('js', 'events.js'));
  const app = read(path.join('js', 'app.js'));
  const style = read(path.join('css', 'style.css'));
  assert.match(mobileHtml, /class="btn-icon mobile-menu-button"[^>]*aria-controls="mobile-drawer"[^>]*aria-expanded="false"/);
  assert.match(mobileHtml, /id="mobile-drawer"[^>]*aria-hidden="true"/);
  assert.match(mobileHtml, /class="mobile-drawer-panel"[^>]*role="dialog"[^>]*aria-modal="true"/);
  assert.match(events, /drawer\.setAttribute\('aria-hidden', 'false'\)/);
  assert.match(events, /setAttribute\('aria-expanded', 'true'\)/);
  assert.match(events, /event\.key === 'Escape'/);
  assert.match(events, /event\.key !== 'Tab'/);
  assert.match(events, /mobileDrawerTrigger\?\.focus\(\)/);
  assert.match(app, /gifImg\.removeAttribute\('src'\)/);
  assert.match(style, /\.single-window-chat[^}]*min-height: min\(480px, calc\(100dvh - 190px\)\)/s);
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
