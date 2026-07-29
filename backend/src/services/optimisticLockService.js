function expectedVersion(req) {
  const header = req.get('If-Match');
  if (header === undefined) return null;
  const value = String(header).trim().replace(/^W\//i, '').replace(/^"|"$/g, '');
  return /^\d+$/.test(value) ? Number(value) : NaN;
}

function versionedUpdate(query, req, updates) {
  const version = expectedVersion(req);
  if (Number.isNaN(version)) return { query: query.whereRaw('1 = 0'), version, enabled: true };
  if (version === null) return { query, version, enabled: false };
  return { query: query.where('version', version), version, enabled: true, updates: { ...updates, version: version + 1 } };
}

module.exports = { expectedVersion, versionedUpdate };
