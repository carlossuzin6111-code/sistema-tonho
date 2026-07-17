const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  AUTOMATIC_BACKUP_PATTERN,
  cleanupBackups,
  createBackupName,
  positiveInteger
} = require('../workers/runBackupWorker');

test('creates sortable automatic backup names', () => {
  const name = createBackupName(new Date('2026-07-17T18:30:45.123Z'));
  expect(name).toBe('database-20260717T183045123Z.sqlite');
  expect(name).toMatch(AUTOMATIC_BACKUP_PATTERN);
});

test('retention removes only recognized automatic backups', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fitlife-retention-'));
  const automatic = [
    'database-20260715T000000000Z.sqlite',
    'database-20260716T000000000Z.sqlite',
    'database-20260717T000000000Z.sqlite'
  ];
  const protectedName = 'database.pre-audit-20260717.sqlite';
  try {
    for (const name of [...automatic, protectedName]) fs.writeFileSync(path.join(directory, name), 'backup');
    expect(cleanupBackups(directory, 2)).toEqual(automatic.slice(1).reverse());
    expect(fs.existsSync(path.join(directory, automatic[0]))).toBe(false);
    expect(fs.existsSync(path.join(directory, protectedName))).toBe(true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('uses safe positive defaults for worker configuration', () => {
  expect(positiveInteger('5', 7)).toBe(5);
  expect(positiveInteger('0', 7)).toBe(7);
  expect(positiveInteger('invalid', 1000)).toBe(1000);
});
