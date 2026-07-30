const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../database');
const { recordAudit } = require('../services/auditService');

async function collectUserExport(userId) {
  const user = await db('users').where({ id: userId }).select('id', 'name', 'email', 'role', 'account_status', 'email_verified_at', 'created_at', 'updated_at').first();
  if (!user) return null;
  const [profile, workouts, exercises, measurements, sessions, sessionExercises, chats, assessments, waivers, auditLogs] = await Promise.all([
    db('student_profiles').where({ student_id: userId }).select('id', 'personal_id', 'height', 'target_weight', 'birth_date', 'relationship_status'),
    db('workouts').where({ student_id: userId }).select('id', 'personal_id', 'name', 'description', 'status', 'created_at', 'updated_at'),
    db('exercises').where({ personal_id: userId }).select('id', 'name', 'description', 'is_custom', 'created_at', 'updated_at'),
    db('measurements').where({ student_id: userId }).select('id', 'weight', 'chest', 'waist', 'hips', 'biceps_l', 'biceps_r', 'thigh_l', 'thigh_r', 'recorded_at'),
    db('workout_sessions').where({ student_id: userId }).select('id', 'workout_id', 'personal_id', 'workout_name', 'status', 'started_at', 'completed_at', 'duration_seconds', 'notes', 'created_at'),
    db('workout_session_exercises as wse').join('workout_sessions as ws', 'ws.id', 'wse.session_id').where('ws.student_id', userId).select('wse.id', 'wse.session_id', 'wse.exercise_name', 'wse.sets_completed', 'wse.sets_target', 'wse.reps_target', 'wse.weight_used', 'wse.completed'),
    db('chat_messages').where(query => query.where({ sender_id: userId }).orWhere({ receiver_id: userId })).select('id', 'sender_id', 'receiver_id', 'message', 'created_at', 'read_status'),
    db('student_assessments').where({ student_id: userId }).select('id', 'personal_id', 'experience_level', 'anatomical_limitations', 'clinical_injuries', 'student_notes', 'created_at', 'updated_at'),
    db('signed_waivers').where({ user_id: userId }).select('id', 'terms_version', 'parq_answers', 'ip_address', 'signed_at'),
    db('audit_logs').where({ actor_user_id: userId }).select('id', 'action', 'target_type', 'target_id', 'metadata', 'created_at')
  ]);
  return { exportedAt: new Date().toISOString(), user, profile, workouts, exercises, measurements, sessions, sessionExercises, chats, assessments, waivers, auditLogs };
}

async function exportData(req, res) {
  try {
    const data = await collectUserExport(req.user.id);
    if (!data) return res.status(404).json({ error: 'User not found' });
    res.set('Cache-Control', 'no-store');
    res.set('Content-Disposition', `attachment; filename="fitlife-data-export-${req.user.id}.json"`);
    return res.json(data);
  } catch (error) {
    console.error('Compliance export error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function anonymizeAccount(req, res) {
  if (req.body.confirmation !== 'DELETE MY ACCOUNT' || typeof req.body.currentPassword !== 'string') return res.status(400).json({ error: 'Explicit confirmation and currentPassword are required' });
  const user = await db('users').where({ id: req.user.id }).first();
  if (!user || !(await bcrypt.compare(req.body.currentPassword, user.password_hash))) return res.status(403).json({ error: 'Current password is invalid' });
  const anonymizedEmail = `deleted+${user.id}@invalid.local`;
  try {
    await db.transaction(async trx => {
      await trx('chat_messages').where({ sender_id: user.id }).orWhere({ receiver_id: user.id }).del();
      await trx('password_reset_tokens').where({ user_id: user.id }).del();
      await trx('email_verification_tokens').where({ user_id: user.id }).del();
      await trx('student_invitations').where({ personal_id: user.id }).del();
      await trx('signed_waivers').where({ user_id: user.id }).del();
      await trx('users').where({ id: user.id }).update({ name: `Deleted user ${user.id}`, email: anonymizedEmail, password_hash: crypto.randomBytes(32).toString('hex'), email_verified_at: null, avatar_filename: null, avatar_updated_at: null, must_change_password: false, account_status: 'archived', session_version: (user.session_version || 0) + 1, updated_at: trx.fn.now() });
      await recordAudit(trx, { actorUserId: user.id, action: 'compliance.account_anonymized', targetType: 'user', targetId: user.id, metadata: { deletedAt: new Date().toISOString() } });
    });
    res.set('Cache-Control', 'no-store');
    return res.status(202).json({ message: 'Account anonymized', accountStatus: 'archived' });
  } catch (error) {
    console.error('Compliance anonymization error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { exportData, anonymizeAccount, collectUserExport };
