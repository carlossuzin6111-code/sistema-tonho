const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const AUTOMATIC_BACKUP_PATTERN = /^database-\d{8}T\d{9}Z\.sqlite$/;

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function createBackupName(date = new Date()) {
  return `database-${date.toISOString().replace(/[-:.]/g, '')}.sqlite`;
}

function cleanupBackups(directory, retention) {
  const backups = fs.readdirSync(directory)
    .filter(name => AUTOMATIC_BACKUP_PATTERN.test(name))
    .sort()
    .reverse();
  for (const name of backups.slice(retention)) fs.unlinkSync(path.join(directory, name));
  return backups.slice(0, retention);
}

async function runBackupCycle(options = {}) {
  const dataDirectory = path.resolve(options.dataDirectory || path.dirname(process.env.DB_PATH || '/app/data/database.sqlite'));
  const backupDirectory = path.join(dataDirectory, 'backups');
  const retention = positiveInteger(options.retention ?? process.env.BACKUP_RETENTION, 7);
  fs.mkdirSync(backupDirectory, { recursive: true });
  const destination = path.join(backupDirectory, createBackupName(options.now));
  const script = path.join(__dirname, '../scripts/backupDatabase.js');
  const { stdout } = await execFileAsync(process.execPath, [script, destination], {
    env: { ...process.env, DB_PATH: process.env.DB_PATH || path.join(dataDirectory, 'database.sqlite') }
  });
  const retained = cleanupBackups(backupDirectory, retention);
  const report = JSON.parse(stdout.trim());
  console.log(`[Backup] Created ${report.destination} (${report.size} bytes, integrity ${report.integrity}). Retained ${retained.length}.`);
  return { ...report, retained };
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

if (require.main === module) {
  main().catch(error => {
    console.error('[Backup] Fatal error:', error.message);
    process.exit(1);
  });
}

module.exports = { AUTOMATIC_BACKUP_PATTERN, cleanupBackups, createBackupName, positiveInteger, runBackupCycle };
