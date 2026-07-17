// Small DOM construction helpers for rendering data received from the API.
(function attachSafeDOM(global) {
  function appendChildren(node, children) {
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) continue;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  }

  function el(tagName, options = {}, children = []) {
    const node = document.createElement(tagName);
    if (options.className) node.className = options.className;
    if (options.text !== undefined && options.text !== null) node.textContent = String(options.text);
    if (options.attrs) {
      for (const [name, value] of Object.entries(options.attrs)) {
        if (value !== undefined && value !== null) node.setAttribute(name, String(value));
      }
    }
    if (options.on) {
      for (const [eventName, handler] of Object.entries(options.on)) node.addEventListener(eventName, handler);
    }
    return appendChildren(node, children);
  }

  function svgEl(tagName, attributes = {}, text) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tagName);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function icon(name, className) {
    return el('i', { className, attrs: { 'data-lucide': name } });
  }

  function clear(node) {
    node.replaceChildren();
  }

  function chatBubble(message, time, direction) {
    const bubble = el('div', { className: `chat-bubble ${direction}` });
    bubble.appendChild(document.createTextNode(String(message ?? '')));
    bubble.appendChild(document.createTextNode(' '));
    bubble.appendChild(el('span', { className: 'chat-time', text: time }));
    return bubble;
  }

  function metricItem(label, value) {
    return el('div', { className: 'metric-item' }, [
      el('span', { className: 'metric-label', text: label }),
      el('span', { className: 'metric-value', text: value })
    ]);
  }

  function errorAlert(prefix, message, extraClass = '') {
    return el('div', {
      className: `info-alert info-alert-error ${extraClass}`.trim()
    }, [
      icon('alert-circle'),
      el('span', { text: `${prefix}${message ?? ''}` })
    ]);
  }

  function isSafeImageSource(source, baseUrl) {
    if (typeof source !== 'string' || source.trim() === '') return false;
    if (/^data:image\/(?:gif|png|jpe?g|webp);base64,/i.test(source)) return true;

    try {
      const base = new URL(baseUrl || document.baseURI);
      const url = new URL(source, base);
      return url.protocol === 'https:' && (url.origin === base.origin || url.hostname === 'raw.githubusercontent.com');
    } catch (err) {
      return false;
    }
  }

  function setSafeImageSource(image, source) {
    if (!isSafeImageSource(source)) {
      image.removeAttribute('src');
      return false;
    }
    image.src = source;
    return true;
  }

  const SafeDOM = {
    appendChildren,
    chatBubble,
    clear,
    el,
    errorAlert,
    icon,
    isSafeImageSource,
    metricItem,
    setSafeImageSource,
    svgEl
  };

  global.SafeDOM = SafeDOM;
  if (typeof module !== 'undefined' && module.exports) module.exports = SafeDOM;
})(typeof window !== 'undefined' ? window : globalThis);
