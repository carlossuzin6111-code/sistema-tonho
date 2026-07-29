const knex = require('knex');
const config = require('../../knexfile');
const { ACCESS_KEY_TTL_DAYS, issueAccessKey, listAccessKeys, revokeAccessKey } = require('../services/accessKeyService');

const env = process.env.NODE_ENV || 'development';

async function main() {
  const db = knex(config[env]);

  try {
    await db.migrate.latest();
    const [command, argument] = process.argv.slice(2);
    if (command === 'list') {
      console.table(await listAccessKeys(db));
      return;
    }
    if (command === 'revoke') {
      const id = Number(argument);
      if (!Number.isInteger(id) || id <= 0) throw new Error('Usage: revoke <positive-id>');
      if (!await revokeAccessKey(db, id)) throw new Error('Key not found, already used, or already revoked');
      console.log(`Access key ${id} revoked.`);
      return;
    }
    if (command && command !== 'create') throw new Error('Usage: create | list | revoke <id>');
    const accessKey = await issueAccessKey(db);

    console.log('Access key created. Store it securely; it will be shown only once:');
    console.log(accessKey);
    console.log(`This key expires in ${ACCESS_KEY_TTL_DAYS} days.`);
  } finally {
    await db.destroy();
  }
}

main().catch(error => {
  console.error('Unable to create access key:', error.message);
  process.exitCode = 1;
});
