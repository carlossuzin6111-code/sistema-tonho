const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { AVATAR_FILE_PATTERN } = require('../workers/runBackupWorker');

function sha256(filename) {
  return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
}

function verifyDatabase(filename) {
  return new Promise((resolve, reject) => {
    const database = new sqlite3.Database(filename, sqlite3.OPEN_READONLY, error => {
      if (error) return reject(error);
      database.get('PRAGMA integrity_check', (queryError, row) => {
        database.close(() => queryError ? reject(queryError) : row?.integrity_check === 'ok' ? resolve() : reject(new Error('Database integrity check failed')));
      });
    });
  });
}

async function restoreBackup(bundleDirectory, targetDirectory) {
  const bundle = path.resolve(bundleDirectory);
  const target = path.resolve(targetDirectory);
  const manifest = JSON.parse(fs.readFileSync(path.join(bundle, 'manifest.json'), 'utf8'));
  if (manifest.formatVersion !== 1 || manifest.database?.file !== 'database.sqlite' || !Array.isArray(manifest.avatars)) throw new Error('Unsupported backup manifest');
  const databaseSource = path.join(bundle, 'database.sqlite');
  if (sha256(databaseSource) !== manifest.database.sha256) throw new Error('Database checksum mismatch');
  await verifyDatabase(databaseSource);
  for (const avatar of manifest.avatars) {
    if (!AVATAR_FILE_PATTERN.test(avatar.file)) throw new Error('Invalid avatar filename in manifest');
    const source = path.join(bundle, 'avatars', avatar.file);
    if (sha256(source) !== avatar.sha256) throw new Error(`Avatar checksum mismatch: ${avatar.file}`);
  }
  if (fs.existsSync(target)) throw new Error('Restore target must not exist');
  const parent = path.dirname(target);
  const staging = path.join(parent, `.${path.basename(target)}.restore-${process.pid}-${Date.now()}`);
  fs.mkdirSync(parent, { recursive: true });
  try {
    fs.mkdirSync(staging);
    fs.copyFileSync(databaseSource, path.join(staging, 'database.sqlite'), fs.constants.COPYFILE_EXCL);
    if (manifest.avatars.length) {
      fs.mkdirSync(path.join(staging, 'avatars'));
      for (const avatar of manifest.avatars) fs.copyFileSync(path.join(bundle, 'avatars', avatar.file), path.join(staging, 'avatars', avatar.file), fs.constants.COPYFILE_EXCL);
    }
    fs.renameSync(staging, target);
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  return { database: path.join(target, 'database.sqlite'), avatars: manifest.avatars.length };
}

if (require.main === module) restoreBackup(process.argv[2], process.argv[3]).then(report => console.log(JSON.stringify(report))).catch(error => { console.error(`Unable to restore backup: ${error.message}`); process.exit(1); });

module.exports = { restoreBackup, verifyDatabase };
