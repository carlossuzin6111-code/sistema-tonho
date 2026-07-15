const knex = require('knex');
const config = require('../../knexfile');
const {
  findUnusedAccessKeyId,
  generateAccessKey,
  hashAccessKey,
  issueAccessKey
} = require('../services/accessKeyService');

describe('access key service', () => {
  let db;

  beforeEach(async () => {
    db = knex(config.test);
    await db.migrate.latest();
  });

  afterEach(async () => {
    await db.destroy();
  });

  test('generates unique 256-bit URL-safe keys', () => {
    const keys = new Set(Array.from({ length: 100 }, () => generateAccessKey()));

    expect(keys.size).toBe(100);
    for (const key of keys) {
      expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
  });

  test('stores only a hash and resolves only unused keys', async () => {
    const accessKey = await issueAccessKey(db);
    const storedKey = await db('registration_keys').first();

    expect(storedKey.key_hash).toBe(hashAccessKey(accessKey));
    expect(storedKey.key_hash).not.toContain(accessKey);
    await expect(findUnusedAccessKeyId(db, accessKey)).resolves.toBe(storedKey.id);

    await db('registration_keys')
      .where({ id: storedKey.id })
      .update({ used_at: db.fn.now() });

    await expect(findUnusedAccessKeyId(db, accessKey)).resolves.toBeNull();
    await expect(findUnusedAccessKeyId(db, 'invalid-key')).resolves.toBeNull();
  });
});
