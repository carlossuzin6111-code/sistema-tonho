process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-bytes';

const fs = require('fs');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3');
const { runBackupCycle } = require('../workers/runBackupWorker');
const { restoreBackup, verifyDatabase } = require('../scripts/restoreBackup');

function openDb(filename) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(filename, error => error ? reject(error) : resolve(db));
  });
}

function runSql(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, error => error ? reject(error) : resolve());
  });
}

function getSql(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => error ? reject(error) : resolve(row));
  });
}

function closeDb(db) {
  return new Promise((resolve, reject) => {
    db.close(error => error ? reject(error) : resolve());
  });
}

describe('Database & Avatar Persistence & Restore Verification (DB-01 & DB-05)', () => {
  let tempDir;
  let previousDbPath;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fitlife-persistence-'));
    previousDbPath = process.env.DB_PATH;
  });

  afterEach(() => {
    if (previousDbPath === undefined) {
      delete process.env.DB_PATH;
    } else {
      process.env.DB_PATH = previousDbPath;
    }
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('DB-01: verifies data directory paths keep database and avatars co-located under same parent directory', () => {
    const dbPath = process.env.DB_PATH || '/app/data/database.sqlite';
    const dataDir = path.dirname(dbPath);
    const expectedAvatarDir = path.join(dataDir, 'avatars');

    // Confirm co-location under persistent volume mount path
    expect(path.extname(dbPath)).toBe('.sqlite');
    expect(expectedAvatarDir).toContain('avatars');
    expect(path.resolve(path.dirname(expectedAvatarDir))).toBe(path.resolve(dataDir));
  });

  test('DB-05: performs full backup cycle, simulates disaster recovery, and verifies restored database and avatars integrity', async () => {
    const dataDir = path.join(tempDir, 'data');
    const backupDir = path.join(dataDir, 'backups');
    const avatarDir = path.join(dataDir, 'avatars');
    const dbFile = path.join(dataDir, 'database.sqlite');

    fs.mkdirSync(avatarDir, { recursive: true });
    process.env.DB_PATH = dbFile;

    // 1. Seed initial database and avatar files
    const db = await openDb(dbFile);
    try {
      await runSql(db, 'PRAGMA journal_mode = WAL');
      await runSql(db, 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, role TEXT, avatar_filename TEXT)');
      await runSql(db, 'CREATE TABLE student_profiles (id INTEGER PRIMARY KEY, student_id INTEGER, height REAL)');
      await runSql(db, 'INSERT INTO users (name, role, avatar_filename) VALUES (?, ?, ?)', ['Personal Alice', 'personal', null]);
      await runSql(db, 'INSERT INTO users (name, role, avatar_filename) VALUES (?, ?, ?)', ['Student Bob', 'student', '2-12345678-1234-1234-1234-123456789abc.webp']);
      await runSql(db, 'INSERT INTO student_profiles (student_id, height) VALUES (?, ?)', [2, 178.5]);
    } finally {
      await closeDb(db);
    }

    const avatarFilename = '2-12345678-1234-1234-1234-123456789abc.webp';
    const avatarContent = Buffer.from('RIFF....WEBPVP8 ... fake webp content');
    fs.writeFileSync(path.join(avatarDir, avatarFilename), avatarContent);

    // 2. Run automatic backup cycle
    const now = new Date('2026-07-20T12:00:00.000Z');
    const backupReport = await runBackupCycle({ dataDirectory: dataDir, retention: 5, now });

    expect(backupReport.integrity).toBe('ok');
    expect(backupReport.avatars).toBe(1);
    expect(fs.existsSync(backupReport.destination)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(path.join(backupReport.destination, 'manifest.json'), 'utf8'));
    expect(manifest.formatVersion).toBe(1);
    expect(manifest.database.integrity).toBe('ok');
    expect(manifest.avatars).toHaveLength(1);
    expect(manifest.avatars[0].file).toBe(avatarFilename);

    // 3. Simulate total data loss (wipe database and avatars directory)
    fs.rmSync(dbFile, { force: true });
    fs.rmSync(`${dbFile}-wal`, { force: true });
    fs.rmSync(`${dbFile}-shm`, { force: true });
    fs.rmSync(avatarDir, { recursive: true, force: true });

    expect(fs.existsSync(dbFile)).toBe(false);
    expect(fs.existsSync(avatarDir)).toBe(false);

    // 4. Restore backup into fresh target directory
    const restoredTargetDir = path.join(tempDir, 'restored_data');
    const restoreReport = await restoreBackup(backupReport.destination, restoredTargetDir);

    expect(restoreReport.avatars).toBe(1);
    expect(fs.existsSync(restoreReport.database)).toBe(true);

    // 5. Verify restored database integrity and record contents
    await verifyDatabase(restoreReport.database);

    const restoredDb = await openDb(restoreReport.database);
    try {
      const userRow = await getSql(restoredDb, 'SELECT * FROM users WHERE name = ?', ['Student Bob']);
      expect(userRow).toBeDefined();
      expect(userRow.role).toBe('student');
      expect(userRow.avatar_filename).toBe(avatarFilename);

      const profileRow = await getSql(restoredDb, 'SELECT * FROM student_profiles WHERE student_id = ?', [2]);
      expect(profileRow).toBeDefined();
      expect(profileRow.height).toBe(178.5);
    } finally {
      await closeDb(restoredDb);
    }

    // 6. Verify restored avatar file matches original content
    const restoredAvatarPath = path.join(restoredTargetDir, 'avatars', avatarFilename);
    expect(fs.existsSync(restoredAvatarPath)).toBe(true);
    expect(fs.readFileSync(restoredAvatarPath)).toEqual(avatarContent);
  });
});
