const counters = new Map();

function increment(name, labels = {}) {
  const key = `${name}|${JSON.stringify(labels)}`;
  counters.set(key, (counters.get(key) || 0) + 1);
}

function snapshot() {
  return [...counters.entries()].map(([key, value]) => {
    const separator = key.indexOf('|');
    return { name: key.slice(0, separator), labels: JSON.parse(key.slice(separator + 1)), value };
  });
}

function reset() { counters.clear(); }

module.exports = { increment, snapshot, reset };
