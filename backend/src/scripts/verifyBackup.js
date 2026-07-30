const fs = require('fs');
const os = require('os');
const path = require('path');
const { restoreBackup } = require('./restoreBackup');

async function main() {
  const bundle = process.argv[2];
  if (!bundle) throw new Error('Usage: node src/scripts/verifyBackup.js <backup-directory>');
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'fitlife-restore-'));
  fs.rmSync(target, { recursive: true, force: true });
  try {
    const report = await restoreBackup(bundle, target);
    console.log(JSON.stringify({ verified: true, ...report }));
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

if (require.main === module) main().catch(error => { console.error(`Backup verification failed: ${error.message}`); process.exit(1); });

module.exports = { main };
