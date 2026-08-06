const db = require('../database');
const { recordAudit } = require('../services/auditService');

function parseScopes(value) {
  try { return JSON.parse(value); } catch { return []; }
}

async function createConsent(req, res) {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Only the student can grant partner consent' });
  const partnerId = Number(req.body.partnerId);
  const scopes = Array.isArray(req.body.scopes) ? [...new Set(req.body.scopes)] : [];
  const allowed = new Set(['workout_logs', 'measurements', 'exams']);
  if (!partnerId || !scopes.length || scopes.some(scope => !allowed.has(scope))) return res.status(400).json({ error: 'partnerId and valid scopes are required' });
  try {
    const partner = await db('professional_partners as pp').join('users as u', 'u.id', 'pp.user_id').where({ 'pp.id': partnerId, 'pp.status': 'active', 'u.role': 'partner' }).first();
    if (!partner) return res.status(404).json({ error: 'Active partner not found' });
    const expiresAt = req.body.expiresAt || null;
    const existing = await db('student_partner_consents').where({ student_id: req.user.id, partner_id: partnerId }).first();
    const payload = { scopes: JSON.stringify(scopes), status: 'active', expires_at: expiresAt, revoked_at: null, updated_at: db.fn.now() };
    let consentId;
    await db.transaction(async trx => {
      if (existing) { await trx('student_partner_consents').where({ id: existing.id }).update(payload); consentId = existing.id; }
      else { [consentId] = await trx('student_partner_consents').insert({ student_id: req.user.id, partner_id: partnerId, ...payload }); }
      await recordAudit(trx, { actorUserId: req.user.id, action: 'partner.consent_granted', targetType: 'partner_consent', targetId: consentId, metadata: { partnerId, scopes } });
    });
    return res.status(existing ? 200 : 201).json({ consentId, partnerId, scopes, status: 'active', expiresAt });
  } catch (error) {
    console.error('Create partner consent error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function revokeConsent(req, res) {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Only the student can revoke partner consent' });
  try {
    const updated = await db('student_partner_consents').where({ id: req.params.id, student_id: req.user.id, status: 'active' }).update({ status: 'revoked', revoked_at: db.fn.now(), updated_at: db.fn.now() });
    return updated ? res.json({ message: 'Partner consent revoked' }) : res.status(404).json({ error: 'Active consent not found' });
  } catch (error) {
    console.error('Revoke partner consent error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getStudentSummary(req, res) {
  if (req.user.role !== 'partner') return res.status(403).json({ error: 'Partner role required' });
  const studentId = Number(req.params.studentId);
  try {
    const partner = await db('professional_partners').where({ user_id: req.user.id, status: 'active' }).first();
    if (!partner) return res.status(403).json({ error: 'Partner profile is inactive' });
    const consent = await db('student_partner_consents').where({ student_id: studentId, partner_id: partner.id, status: 'active' }).first();
    if (!consent || (consent.expires_at && new Date(consent.expires_at).getTime() <= Date.now())) return res.status(403).json({ error: 'Active student consent required' });
    const scopes = parseScopes(consent.scopes);
    const response = { studentId, scopes };
    if (scopes.includes('workout_logs')) response.workouts = await db('workout_sessions').where({ student_id: studentId }).select('id', 'workout_name', 'status', 'started_at', 'completed_at').orderBy('started_at', 'desc').limit(50);
    if (scopes.includes('measurements')) response.measurements = await db('measurements').where({ student_id: studentId }).select('weight', 'recorded_at').orderBy('recorded_at', 'desc').limit(50);
    return res.json(response);
  } catch (error) {
    console.error('Partner student summary error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function listConsents(req, res) {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Only the student can list partner consents' });
  try {
    const rows = await db('student_partner_consents as spc')
      .join('professional_partners as pp', 'pp.id', 'spc.partner_id')
      .join('users as u', 'u.id', 'pp.user_id')
      .where({ 'spc.student_id': req.user.id })
      .select(
        'spc.id',
        'spc.partner_id as partnerId',
        'u.name as partnerName',
        'pp.specialty',
        'pp.organization',
        'spc.scopes',
        'spc.status',
        'spc.expires_at as expiresAt',
        'spc.revoked_at as revokedAt',
        'spc.created_at as createdAt'
      )
      .orderBy('spc.created_at', 'desc');

    const formatted = rows.map(r => ({
      ...r,
      scopes: parseScopes(r.scopes)
    }));

    return res.json(formatted);
  } catch (error) {
    console.error('List partner consents error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function listAvailablePartners(req, res) {
  try {
    const rows = await db('professional_partners as pp')
      .join('users as u', 'u.id', 'pp.user_id')
      .where({ 'pp.status': 'active', 'u.role': 'partner' })
      .select('pp.id', 'u.name', 'pp.specialty', 'pp.organization')
      .orderBy('u.name', 'asc');
    return res.json(rows);
  } catch (error) {
    console.error('List available partners error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { createConsent, getStudentSummary, revokeConsent, listConsents, listAvailablePartners };
