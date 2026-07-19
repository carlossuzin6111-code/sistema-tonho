const fs = require('fs');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3');
const {
  AUTOMATIC_BACKUP_PATTERN,
  cleanupBackups,
  createBackupName,
  positiveInteger,
  runBackupCycle
} = require('../workers/runBackupWorker');
const { restoreBackup } = require('../scripts/restoreBackup');

test('creates sortable automatic backup names', () => {
  const name = createBackupName(new Date('2026-07-17T18:30:45.123Z'));
  expect(name).toBe('backup-20260717T183045123Z');
  expect(name).toMatch(AUTOMATIC_BACKUP_PATTERN);
});

test('retention removes only recognized automatic backups', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fitlife-retention-'));
  const automatic = [
    'backup-20260715T000000000Z',
    'backup-20260716T000000000Z',
    'backup-20260717T000000000Z'
  ];
  const protectedName = 'database.pre-audit-20260717.sqlite';
  try {
    for (const name of automatic) fs.mkdirSync(path.join(directory, name));
    fs.writeFileSync(path.join(directory, protectedName), 'backup');
    expect(cleanupBackups(directory, 2)).toEqual(automatic.slice(1).reverse());
    expect(fs.existsSync(path.join(directory, automatic[0]))).toBe(false);
    expect(fs.existsSync(path.join(directory, protectedName))).toBe(true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function createFixtureDatabase(filename) {
  return new Promise((resolve, reject) => {
    const database = new sqlite3.Database(filename, error => {
      if (error) return reject(error);
      database.exec('CREATE TABLE sample (id INTEGER PRIMARY KEY, value TEXT); INSERT INTO sample(value) VALUES (\'preserved\')', execError => {
        database.close(() => execError ? reject(execError) : resolve());
      });
    });
  });
}

test('backs up and restores the database and private avatars as one verified set', async () => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'fitlife-bundle-'));
  const restoreDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'fitlife-restore-'));
  fs.rmSync(restoreDirectory, { recursive: true, force: true });
  const previousDbPath = process.env.DB_PATH;
  try {
    const database = path.join(dataDirectory, 'database.sqlite');
    await createFixtureDatabase(database);
    fs.mkdirSync(path.join(dataDirectory, 'avatars'));
    fs.writeFileSync(path.join(dataDirectory, 'avatars', '1-123e4567-e89b-12d3-a456-426614174000.webp'), 'avatar-bytes');
    process.env.DB_PATH = database;
    const report = await runBackupCycle({ dataDirectory, retention: 2, now: new Date('2026-07-18T12:00:00.000Z') });
    expect(report).toMatchObject({ integrity: 'ok', avatars: 1 });
    const manifest = JSON.parse(fs.readFileSync(path.join(report.destination, 'manifest.json'), 'utf8'));
    expect(manifest.avatars).toHaveLength(1);
    await expect(restoreBackup(report.destination, restoreDirectory)).resolves.toMatchObject({ avatars: 1 });
    expect(fs.readFileSync(path.join(restoreDirectory, 'avatars', manifest.avatars[0].file), 'utf8')).toBe('avatar-bytes');
  } finally {
    if (previousDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = previousDbPath;
    fs.rmSync(dataDirectory, { recursive: true, force: true });
    fs.rmSync(restoreDirectory, { recursive: true, force: true });
  }
});

test('backs up and restores a database when no avatar directory exists', async () => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'fitlife-no-avatars-'));
  const restoreDirectory = path.join(dataDirectory, 'restored');
  const previousDbPath = process.env.DB_PATH;
  try {
    const database = path.join(dataDirectory, 'database.sqlite');
    await createFixtureDatabase(database);
    process.env.DB_PATH = database;
    const report = await runBackupCycle({ dataDirectory, now: new Date('2026-07-18T12:00:30.000Z') });
    expect(report.avatars).toBe(0);
    const manifest = JSON.parse(fs.readFileSync(path.join(report.destination, 'manifest.json'), 'utf8'));
    expect(manifest.avatars).toEqual([]);
    await expect(restoreBackup(report.destination, restoreDirectory)).resolves.toMatchObject({ avatars: 0 });
    expect(fs.existsSync(path.join(restoreDirectory, 'database.sqlite'))).toBe(true);
    expect(fs.existsSync(path.join(restoreDirectory, 'avatars'))).toBe(false);
  } finally {
    if (previousDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = previousDbPath;
    fs.rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test('refuses restoration when an avatar no longer matches the manifest', async () => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'fitlife-corrupt-'));
  const restoreDirectory = path.join(dataDirectory, 'restore');
  const previousDbPath = process.env.DB_PATH;
  try {
    const database = path.join(dataDirectory, 'database.sqlite');
    await createFixtureDatabase(database);
    fs.mkdirSync(path.join(dataDirectory, 'avatars'));
    const avatar = '2-123e4567-e89b-12d3-a456-426614174000.webp';
    fs.writeFileSync(path.join(dataDirectory, 'avatars', avatar), 'original');
    process.env.DB_PATH = database;
    const report = await runBackupCycle({ dataDirectory, now: new Date('2026-07-18T12:01:00.000Z') });
    fs.writeFileSync(path.join(report.destination, 'avatars', avatar), 'tampered');
    await expect(restoreBackup(report.destination, restoreDirectory)).rejects.toThrow('Avatar checksum mismatch');
    expect(fs.existsSync(restoreDirectory)).toBe(false);
  } finally {
    if (previousDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = previousDbPath;
    fs.rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test('refuses restoration when a manifest avatar is missing without creating the target', async () => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'fitlife-missing-avatar-'));
  const restoreDirectory = path.join(dataDirectory, 'restore');
  const previousDbPath = process.env.DB_PATH;
  try {
    const database = path.join(dataDirectory, 'database.sqlite');
    await createFixtureDatabase(database);
    fs.mkdirSync(path.join(dataDirectory, 'avatars'));
    const avatar = '3-123e4567-e89b-12d3-a456-426614174000.webp';
    fs.writeFileSync(path.join(dataDirectory, 'avatars', avatar), 'avatar');
    process.env.DB_PATH = database;
    const report = await runBackupCycle({ dataDirectory, now: new Date('2026-07-18T12:01:30.000Z') });
    fs.rmSync(path.join(report.destination, 'avatars', avatar));
    await expect(restoreBackup(report.destination, restoreDirectory)).rejects.toThrow();
    expect(fs.existsSync(restoreDirectory)).toBe(false);
  } finally {
    if (previousDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = previousDbPath;
    fs.rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test('refuses an existing restore target without changing it', async () => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'fitlife-existing-'));
  const restoreDirectory = path.join(dataDirectory, 'existing-target');
  const previousDbPath = process.env.DB_PATH;
  try {
    const database = path.join(dataDirectory, 'database.sqlite');
    await createFixtureDatabase(database);
    process.env.DB_PATH = database;
    const report = await runBackupCycle({ dataDirectory, now: new Date('2026-07-18T12:02:00.000Z') });
    fs.mkdirSync(restoreDirectory);
    fs.writeFileSync(path.join(restoreDirectory, 'keep.txt'), 'untouched');
    await expect(restoreBackup(report.destination, restoreDirectory)).rejects.toThrow('Restore target must not exist');
    expect(fs.readFileSync(path.join(restoreDirectory, 'keep.txt'), 'utf8')).toBe('untouched');
  } finally {
    if (previousDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = previousDbPath;
    fs.rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test('uses safe positive defaults for worker configuration', () => {
  expect(positiveInteger('5', 7)).toBe(5);
  expect(positiveInteger('0', 7)).toBe(7);
  expect(positiveInteger('invalid', 1000)).toBe(1000);
});
