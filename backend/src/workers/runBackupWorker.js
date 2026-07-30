const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { uploadOffsiteBackup } = require('../services/offsiteBackupService');

const execFileAsync = promisify(execFile);
const AUTOMATIC_BACKUP_PATTERN = /^backup-\d{8}T\d{9}Z$/;
const AVATAR_FILE_PATTERN = /^\d+-[0-9a-f-]+\.webp$/i;

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function createBackupName(date = new Date()) {
  return `backup-${date.toISOString().replace(/[-:.]/g, '')}`;
}

function sha256(filename) {
  return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
}

function cleanupBackups(directory, retention) {
  const backups = fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && AUTOMATIC_BACKUP_PATTERN.test(entry.name))
    .map(entry => entry.name)
    .sort()
    .reverse();
  for (const name of backups.slice(retention)) fs.rmSync(path.join(directory, name), { recursive: true, force: true });
  return backups.slice(0, retention);
}

function copyAvatars(sourceDirectory, destinationDirectory) {
  if (!fs.existsSync(sourceDirectory)) return [];
  fs.mkdirSync(destinationDirectory, { recursive: true });
  const files = fs.readdirSync(sourceDirectory, { withFileTypes: true })
    .filter(entry => entry.isFile() && AVATAR_FILE_PATTERN.test(entry.name))
    .map(entry => entry.name)
    .sort();
  return files.map(file => {
    const source = path.join(sourceDirectory, file);
    const destination = path.join(destinationDirectory, file);
    fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
    return { file, size: fs.statSync(destination).size, sha256: sha256(destination) };
  });
}

async function runBackupCycle(options = {}) {
  const dataDirectory = path.resolve(options.dataDirectory || path.dirname(process.env.DB_PATH || '/app/data/database.sqlite'));
  const backupDirectory = path.join(dataDirectory, 'backups');
  const retention = positiveInteger(options.retention ?? process.env.BACKUP_RETENTION, 7);
  const name = createBackupName(options.now);
  const finalDirectory = path.join(backupDirectory, name);
  const stagingDirectory = path.join(backupDirectory, `.${name}.tmp-${process.pid}`);
  fs.mkdirSync(backupDirectory, { recursive: true });
  fs.rmSync(stagingDirectory, { recursive: true, force: true });
  fs.mkdirSync(stagingDirectory);

  try {
    const databaseDestination = path.join(stagingDirectory, 'database.sqlite');
    const script = path.join(__dirname, '../scripts/backupDatabase.js');
    const { stdout } = await execFileAsync(process.execPath, [script, databaseDestination], {
      env: { ...process.env, DB_PATH: process.env.DB_PATH || path.join(dataDirectory, 'database.sqlite') }
    });
    const databaseReport = JSON.parse(stdout.trim());
    const avatars = copyAvatars(path.join(dataDirectory, 'avatars'), path.join(stagingDirectory, 'avatars'));
    const manifest = {
      formatVersion: 1,
      createdAt: (options.now || new Date()).toISOString(),
      database: { file: 'database.sqlite', size: databaseReport.size, sha256: sha256(databaseDestination), integrity: databaseReport.integrity },
      avatars
    };
    fs.writeFileSync(path.join(stagingDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
    fs.renameSync(stagingDirectory, finalDirectory);
    const retained = cleanupBackups(backupDirectory, retention);
    const offsite = await uploadOffsiteBackup(finalDirectory, { now: options.now });
    console.log(`[Backup] Created ${finalDirectory} (${avatars.length} avatars, integrity ${databaseReport.integrity}). Retained ${retained.length}. Off-site: ${offsite.uploaded ? 'uploaded' : offsite.reason}.`);
    return { destination: finalDirectory, integrity: databaseReport.integrity, size: databaseReport.size, avatars: avatars.length, retained, offsite };
  } catch (error) {
    fs.rmSync(stagingDirectory, { recursive: true, force: true });
    throw error;
  }
}

async function main() {
  const intervalMs = positiveInteger(process.env.BACKUP_INTERVAL_MS, 24 * 60 * 60 * 1000);
  let activeCycle = runBackupCycle();
  await activeCycle;
  const timer = setInterval(() => {
    activeCycle = runBackupCycle().catch(error => console.error('[Backup] Cycle failed:', error.message));
  }, intervalMs);
  async function shutdown(signal) {
    clearInterval(timer);
    console.log(`[Backup] ${signal} received; waiting for the active cycle.`);
    await activeCycle.catch(() => {});
    process.exit(0);
  }
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
  console.log(`[Backup] Worker started. Interval ${intervalMs} ms.`);
}

if (require.main === module) main().catch(error => { console.error('[Backup] Fatal error:', error.message); process.exit(1); });

module.exports = { AUTOMATIC_BACKUP_PATTERN, AVATAR_FILE_PATTERN, cleanupBackups, copyAvatars, createBackupName, positiveInteger, runBackupCycle, sha256 };
