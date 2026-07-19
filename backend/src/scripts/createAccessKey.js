const knex = require('knex');
const config = require('../../knexfile');
const { ACCESS_KEY_TTL_DAYS, issueAccessKey } = require('../services/accessKeyService');

const env = process.env.NODE_ENV || 'development';

async function main() {
  const db = knex(config[env]);

  try {
    await db.migrate.latest();
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
