const db = require('../database');
const { pruneExpiredExports } = require('../services/complianceExportService');

const INTERVAL_MS = Math.max(60_000, Number(process.env.COMPLIANCE_EXPORT_POLL_INTERVAL_MS || 300_000));

async function runComplianceExportCycle() {
  await pruneExpiredExports();
}

async function run() {
  await db.ready;
  await runComplianceExportCycle();
  setInterval(() => runComplianceExportCycle().catch(error => console.error('[Compliance exports] cycle failed:', error.message)), INTERVAL_MS);
}

if (require.main === module) run().catch(error => { console.error('[Compliance exports] worker failed:', error); process.exitCode = 1; });

module.exports = { INTERVAL_MS, runComplianceExportCycle };
