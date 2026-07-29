const db = require('../database');
const { recordAudit } = require('../services/auditService');
const { runDailyCrm } = require('../services/crmService');

function personalOnly(req, res) {
  if (req.user.role !== 'personal') {
    res.status(403).json({ error: 'Personal role required' });
    return false;
  }
  return true;
}

async function runDaily(req, res) {
  if (!personalOnly(req, res)) return;
  const thresholdDays = Number(req.body.thresholdDays || 5);
  if (!Number.isInteger(thresholdDays) || thresholdDays < 1 || thresholdDays > 365) return res.status(400).json({ error: 'thresholdDays must be between 1 and 365' });
  try {
    const result = await runDailyCrm(db, { personalId: req.user.id, thresholdDays, actorUserId: req.user.id });
    return res.status(202).json({ ...result, emailDispatch: 'not_configured' });
  } catch (error) {
    console.error('Run CRM daily job error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function listAlerts(req, res) {
  if (!personalOnly(req, res)) return;
  const rows = await db('crm_alerts as a').join('users as u', 'u.id', 'a.student_id').where('a.personal_id', req.user.id).select('a.id', 'a.student_id as studentId', 'u.name as studentName', 'a.alert_type as alertType', 'a.inactivity_days as inactivityDays', 'a.status', 'a.detected_on as detectedOn', 'a.created_at as createdAt').orderBy('a.created_at', 'desc').limit(200);
  return res.json(rows);
}

async function resolveAlert(req, res) {
  if (!personalOnly(req, res)) return;
  const updated = await db('crm_alerts').where({ id: req.params.id, personal_id: req.user.id, status: 'open' }).update({ status: 'resolved', resolved_at: db.fn.now(), updated_at: db.fn.now() });
  if (!updated) return res.status(404).json({ error: 'Open CRM alert not found' });
  await recordAudit(db, { actorUserId: req.user.id, action: 'crm.alert_resolved', targetType: 'crm_alert', targetId: req.params.id });
  return res.json({ message: 'CRM alert resolved' });
}

async function listNps(req, res) {
  if (!personalOnly(req, res)) return;
  const rows = await db('nps_surveys as n').join('users as u', 'u.id', 'n.student_id').where('n.personal_id', req.user.id).select('n.id', 'n.student_id as studentId', 'u.name as studentName', 'n.status', 'n.score', 'n.comment', 'n.sent_at as sentAt', 'n.responded_at as respondedAt').orderBy('n.sent_at', 'desc').limit(200);
  return res.json(rows);
}

async function listStudentNps(req, res) {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Student role required' });
  const rows = await db('nps_surveys').where({ student_id: req.user.id, status: 'pending' }).select('id', 'sent_at as sentAt').orderBy('sent_at', 'desc');
  return res.json(rows);
}

async function respondNps(req, res) {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Student role required' });
  const score = Number(req.body.score);
  if (!Number.isInteger(score) || score < 0 || score > 10) return res.status(400).json({ error: 'score must be an integer between 0 and 10' });
  const comment = req.body.comment == null ? null : String(req.body.comment).slice(0, 1000);
  const updated = await db('nps_surveys').where({ id: req.params.id, student_id: req.user.id, status: 'pending' }).update({ status: 'responded', score, comment, responded_at: db.fn.now(), updated_at: db.fn.now() });
  if (!updated) return res.status(404).json({ error: 'Pending NPS survey not found' });
  await recordAudit(db, { actorUserId: req.user.id, action: 'crm.nps_responded', targetType: 'nps_survey', targetId: req.params.id, metadata: { score } });
  return res.json({ message: 'NPS response recorded', score });
}

module.exports = { runDaily, listAlerts, resolveAlert, listNps, listStudentNps, respondNps };
