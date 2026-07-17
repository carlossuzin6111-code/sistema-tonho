const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const sqlite3 = require('sqlite3');

function openDatabase(filename, mode = sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE) {
  return new Promise((resolve, reject) => {
    const database = new sqlite3.Database(filename, mode, error => error ? reject(error) : resolve(database));
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

test('backup CLI creates a verified SQLite snapshot with the source data', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fitlife-backup-'));
  const source = path.join(directory, 'source.sqlite');
  const destination = path.join(directory, 'backup.sqlite');
  const database = await openDatabase(source);

  try {
    await run(database, 'CREATE TABLE sample (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
    await run(database, "INSERT INTO sample (value) VALUES ('preserved')");
  } finally {
    await close(database);
  }

  try {
    const result = spawnSync(process.execPath, [
      path.join(__dirname, '../scripts/backupDatabase.js'),
      destination
    ], {
      encoding: 'utf8',
      env: { ...process.env, DB_PATH: source }
    });

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout.trim());
    expect(report).toMatchObject({ destination, integrity: 'ok', tables: 1 });
    expect(report.size).toBeGreaterThan(0);

    const backup = await openDatabase(destination, sqlite3.OPEN_READONLY);
    try {
      await expect(get(backup, 'SELECT value FROM sample')).resolves.toEqual({ value: 'preserved' });
    } finally {
      await close(backup);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
