const crypto = require('crypto');

const ACCESS_KEY_BYTES = 32;
const ACCESS_KEY_TTL_DAYS = 7;

function generateAccessKey() {
  return crypto.randomBytes(ACCESS_KEY_BYTES).toString('base64url');
}

function hashAccessKey(accessKey) {
  return crypto.createHash('sha256').update(accessKey, 'utf8').digest('hex');
}

async function issueAccessKey(dbConnection) {
  const accessKey = generateAccessKey();
  const keyHash = hashAccessKey(accessKey);

  await dbConnection('registration_keys').insert({
    key_hash: keyHash,
    expires_at: dbConnection.raw(`datetime('now', '+${ACCESS_KEY_TTL_DAYS} days')`)
  });
  return accessKey;
}

async function findUnusedAccessKeyId(dbConnection, accessKey) {
  if (typeof accessKey !== 'string' || accessKey.length === 0) {
    return null;
  }

  const key = await dbConnection('registration_keys')
    .select('id')
    .where({ key_hash: hashAccessKey(accessKey) })
    .whereNull('used_at')
    .where('expires_at', '>', dbConnection.fn.now())
    .first();

  return key ? key.id : null;
}

module.exports = {
  ACCESS_KEY_TTL_DAYS,
  findUnusedAccessKeyId,
  generateAccessKey,
  hashAccessKey,
  issueAccessKey
};
