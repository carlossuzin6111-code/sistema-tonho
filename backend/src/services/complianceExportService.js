const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const db = require('../database');
const { collectUserExport } = require('../controllers/complianceController');

const EXPORT_DIR = process.env.COMPLIANCE_EXPORT_DIR || path.join(process.cwd(), 'data', 'exports');
const RETENTION_MS = Number(process.env.COMPLIANCE_EXPORT_RETENTION_MS || 15 * 60 * 1000);

async function enqueueExport(userId) {
  const expiresAt = new Date(Date.now() + RETENTION_MS);
  const [job] = await db('compliance_export_jobs').insert({ user_id: userId, expires_at: expiresAt }).returning('*');
  setImmediate(() => processExport(job.id).catch(() => {}));
  return job;
}

async function processExport(jobId) {
  const job = await db('compliance_export_jobs').where({ id: jobId, status: 'pending' }).first();
  if (!job) return;
  await db('compliance_export_jobs').where({ id: jobId }).update({ status: 'processing', started_at: db.fn.now() });
  try {
    const data = await collectUserExport(job.user_id);
    if (!data) throw new Error('user_not_found');
    await fs.mkdir(EXPORT_DIR, { recursive: true });
    const filePath = path.join(EXPORT_DIR, `export-${job.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(data), { mode: 0o600 });
    await db('compliance_export_jobs').where({ id: jobId }).update({ status: 'completed', file_path: filePath, completed_at: db.fn.now() });
  } catch (error) {
    await db('compliance_export_jobs').where({ id: jobId }).update({ status: 'failed', error_message: error.message.slice(0, 200), completed_at: db.fn.now() });
  }
}

async function pruneExpiredExports() {
  const jobs = await db('compliance_export_jobs').where('expires_at', '<', db.fn.now()).whereNot('status', 'deleted');
  for (const job of jobs) { if (job.file_path) await fs.rm(job.file_path, { force: true }).catch(() => {}); }
  if (jobs.length) await db('compliance_export_jobs').whereIn('id', jobs.map(j => j.id)).update({ status: 'deleted', file_path: null });
}

module.exports = { enqueueExport, processExport, pruneExpiredExports, RETENTION_MS };
