const db = require('../database');
const { recordAudit } = require('../services/auditService');
const { readinessScore, recommendation } = require('../services/readinessService');

function value(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 5 ? parsed : null;
}

function dateKey(input) {
  const key = input || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const parsed = new Date(`${key}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : key;
}

async function save(req, res) {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Student role required' });
  const doms = value(req.body.doms);
  const sleepQuality = value(req.body.sleepQuality);
  const fatigue = value(req.body.fatigue);
  const mood = value(req.body.mood);
  const key = dateKey(req.body.date);
  if ([doms, sleepQuality, fatigue, mood].some(item => item === null) || !key) return res.status(400).json({ error: 'date and all readiness values must be valid (1..5)' });
  const notes = req.body.notes == null ? null : String(req.body.notes).slice(0, 1000);
  const score = readinessScore({ doms, sleepQuality, fatigue, mood });
  try {
    const existing = await db('readiness_checkins').where({ student_id: req.user.id, date_key: key }).first();
    const payload = { doms, sleep_quality: sleepQuality, fatigue, mood, readiness_score: score, notes, updated_at: db.fn.now() };
    let id;
    await db.transaction(async trx => {
      if (existing) { await trx('readiness_checkins').where({ id: existing.id }).update(payload); id = existing.id; }
      else [id] = await trx('readiness_checkins').insert({ student_id: req.user.id, date_key: key, ...payload });
      await recordAudit(trx, { actorUserId: req.user.id, action: 'readiness.checked_in', targetType: 'readiness_checkin', targetId: id, metadata: { date: key, score } });
    });
    return res.status(existing ? 200 : 201).json({ id, date: key, doms, sleepQuality, fatigue, mood, score, recommendation: recommendation({ doms, sleepQuality, fatigue, mood }) });
  } catch (error) {
    console.error('Save readiness check-in error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

function mapRow(row) {
  return { id: row.id, studentId: row.student_id, date: row.date_key, doms: row.doms, sleepQuality: row.sleep_quality, fatigue: row.fatigue, mood: row.mood, score: row.readiness_score, notes: row.notes };
}

async function listStudent(req, res) {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Student role required' });
  const rows = await db('readiness_checkins').where({ student_id: req.user.id }).orderBy('date_key', 'desc').limit(90);
  return res.json(rows.map(mapRow));
}

async function listForPersonal(req, res) {
  if (req.user.role !== 'personal') return res.status(403).json({ error: 'Personal role required' });
  const studentId = Number(req.params.id);
  const linked = await db('student_profiles').where({ student_id: studentId, personal_id: req.user.id }).first();
  if (!linked) return res.status(404).json({ error: 'Student not found' });
  const rows = await db('readiness_checkins').where({ student_id: studentId }).orderBy('date_key', 'desc').limit(90);
  return res.json(rows.map(mapRow));
}

async function getRecommendation(req, res) {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Student role required' });
  const row = await db('readiness_checkins').where({ student_id: req.user.id }).orderBy('date_key', 'desc').first();
  if (!row) return res.status(404).json({ error: 'No readiness check-in found' });
  return res.json({ date: row.date_key, ...recommendation({ doms: row.doms, sleepQuality: row.sleep_quality, fatigue: row.fatigue, mood: row.mood }) });
}

module.exports = { save, listStudent, listForPersonal, getRecommendation };
