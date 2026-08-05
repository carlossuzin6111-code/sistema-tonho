const counters = new Map();

function keyFor(name, labels) {
  return `${name}|${JSON.stringify(labels)}`;
}

function add(name, value, labels = {}) {
  if (!Number.isFinite(value)) return;
  const key = keyFor(name, labels);
  counters.set(key, (counters.get(key) || 0) + value);
}

function increment(name, labels = {}) {
  add(name, 1, labels);
}

function observe(name, value, labels = {}) {
  add(`${name}_sum`, value, labels);
  increment(`${name}_count`, labels);
}

function snapshot() {
  return [...counters.entries()].map(([key, value]) => {
    const separator = key.indexOf('|');
    return { name: key.slice(0, separator), labels: JSON.parse(key.slice(separator + 1)), value };
  });
}

function reset() { counters.clear(); }

function escapeLabel(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

function toPrometheus() {
  return snapshot().map(metric => {
    const name = metric.name.replace(/[^a-zA-Z0-9_:]/g, '_');
    const labels = Object.entries(metric.labels)
      .map(([key, value]) => `${key.replace(/[^a-zA-Z0-9_]/g, '_')}="${escapeLabel(value)}"`)
      .join(',');
    return `${name}${labels ? `{${labels}}` : ''} ${metric.value}`;
  }).join('\n') + '\n';
}

module.exports = { add, increment, observe, reset, snapshot, toPrometheus };
