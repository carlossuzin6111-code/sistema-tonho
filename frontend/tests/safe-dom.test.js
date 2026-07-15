const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

class FakeNode {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.attributes = {};
    this.style = {};
    this.textContent = '';
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.children = children;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  removeAttribute(name) {
    delete this.attributes[name];
    if (name === 'src') delete this.src;
  }

  addEventListener(name, handler) {
    this[`on_${name}`] = handler;
  }
}

global.document = {
  baseURI: 'https://fitlife.example/app/',
  createElement: tagName => new FakeNode(tagName),
  createElementNS: (namespace, tagName) => new FakeNode(tagName),
  createTextNode: value => ({ nodeType: 3, textContent: String(value) })
};

const SafeDOM = require('../js/safe-dom');

test('renders malicious chat payloads as text nodes', () => {
  const payload = '<img src=x onerror="globalThis.pwned=true">';
  const bubble = SafeDOM.chatBubble(payload, '10:30', 'received');

  assert.equal(bubble.tagName, 'div');
  assert.equal(bubble.children[0].nodeType, 3);
  assert.equal(bubble.children[0].textContent, payload);
  assert.equal(bubble.children.some(child => child.tagName === 'img'), false);
});

test('renders malicious names, workouts and exercises as literal text', () => {
  const fields = {
    name: '<img src=x onerror=alert("name")>',
    workout: '<svg onload=alert("workout")>',
    exercise: '</span><script>alert("exercise")</script>'
  };

  for (const [field, payload] of Object.entries(fields)) {
    const node = SafeDOM.el('span', { text: payload });
    assert.equal(node.textContent, payload, `${field} was not preserved as text`);
    assert.deepEqual(node.children, [], `${field} created child elements`);
  }
});

test('accepts only web URLs and raster data URLs for images', () => {
  assert.equal(SafeDOM.isSafeImageSource('https://cdn.example/exercise.gif'), true);
  assert.equal(SafeDOM.isSafeImageSource('/images/exercise.png'), true);
  assert.equal(SafeDOM.isSafeImageSource('data:image/gif;base64,R0lGODlhAQABAAAAACw='), true);
  assert.equal(SafeDOM.isSafeImageSource('javascript:alert(1)'), false);
  assert.equal(SafeDOM.isSafeImageSource('data:image/svg+xml,<svg onload=alert(1)>'), false);
});

test('frontend scripts do not interpolate data into innerHTML or inline handlers', () => {
  const scripts = ['app.js', 'personal.js', 'student.js'];
  for (const filename of scripts) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', filename), 'utf8');
    const templates = [...source.matchAll(/innerHTML\s*=\s*`([\s\S]*?)`/g)];

    for (const template of templates) {
      assert.equal(template[1].includes('${'), false, `${filename} has dynamic innerHTML`);
    }
    assert.doesNotMatch(source, /onclick="|onchange="/i, `${filename} has an inline event handler`);
  }
});

test('browser session credentials are not exposed to JavaScript or SSE URLs', () => {
  const apiSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'api.js'), 'utf8');
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

  assert.doesNotMatch(apiSource, /(?:getItem|setItem)\(['"]fitlife_token|Authorization\s*:|Bearer\s+\$\{|[?&]token=/);
  assert.match(apiSource, /removeItem\(['"]fitlife_token['"]\)/);
  assert.doesNotMatch(appSource, /data\.token|getToken\(/);
  assert.match(apiSource, /new EventSource\([^?]+withCredentials:\s*true/);
});
