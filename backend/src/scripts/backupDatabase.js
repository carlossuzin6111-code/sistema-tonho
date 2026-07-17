const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');

const source = path.resolve(process.env.DB_PATH || path.join(__dirname, '../../data/database.sqlite'));
const destination = path.resolve(process.argv[2] || `${source}.backup`);

if (source === destination) {
  console.error('Backup destination must differ from the source database.');
  process.exit(1);
}

function openDatabase(filename, mode) {
  return new Promise((resolve, reject) => {
    const database = new sqlite3.Database(filename, mode, error => {
      if (error) reject(error);
      else resolve(database);
    });
  });
}

function run(database, sql) {
  return new Promise((resolve, reject) => {
    database.run(sql, error => error ? reject(error) : resolve());
  });
}

function get(database, sql) {
  return new Promise((resolve, reject) => {
    database.get(sql, (error, row) => error ? reject(error) : resolve(row));
  });
}

function close(database) {
  return new Promise((resolve, reject) => {
    database.close(error => error ? reject(error) : resolve());
  });
}

async function main() {
  if (fs.existsSync(destination)) fs.unlinkSync(destination);
  const escapedDestination = destination.replaceAll("'", "''");
  const database = await openDatabase(source, sqlite3.OPEN_READONLY);

  try {
    await run(database, `VACUUM INTO '${escapedDestination}'`);
  } finally {
    await close(database);
  }

  const backup = await openDatabase(destination, sqlite3.OPEN_READONLY);
  try {
    const integrity = await get(backup, 'PRAGMA integrity_check');
    const tables = await get(backup, "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'");
    const size = fs.statSync(destination).size;
    if (integrity.integrity_check !== 'ok' || tables.count < 1 || size < 1) {
      throw new Error('Backup verification failed.');
    }
    console.log(JSON.stringify({ destination, size, tables: tables.count, integrity: integrity.integrity_check }));
  } finally {
    await close(backup);
  }
}

main().catch(error => {
  console.error(`Unable to back up database: ${error.message}`);
  process.exit(1);
});
