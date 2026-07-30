const bcrypt = require('bcryptjs');
const fs = require('fs');
const db = require('../database');
const { createSession, setSessionCookies } = require('../services/sessionService');
const { AUDIT_ACTIONS, recordAudit } = require('../services/auditService');
const { AvatarError, cleanupUserAvatars, removeAvatar, resolveAvatarPath, writeAvatar } = require('../services/avatarService');
const { expectedVersion } = require('../services/optimisticLockService');

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    mustChangePassword: Boolean(user.must_change_password),
    version: user.version ?? 1,
    hasAvatar: Boolean(user.avatar_filename),
    avatarUpdatedAt: user.avatar_updated_at || null
  };
}

async function updateName(req, res) {
  if (typeof req.body.name !== 'string') return res.status(400).json({ error: 'Name is required' });
  const name = req.body.name.trim().replace(/\s+/g, ' ');
  if (name.length < 2) return res.status(400).json({ error: 'Name must have at least 2 characters' });
  try {
    const version = expectedVersion(req);
    if (Number.isNaN(version)) return res.status(400).json({ error: 'If-Match must contain a numeric version' });
    const current = await db('users').select('version').where({ id: req.user.id }).first();
    if (version !== null && (!current || current.version !== version)) return res.status(409).json({ error: 'Resource was modified; reload before saving' });
    await db.transaction(async trx => {
      const updateQuery = trx('users').where({ id: req.user.id });
      if (version !== null) updateQuery.where('version', version);
      const updated = await updateQuery.update({ name, updated_at: trx.fn.now(), ...(version === null ? {} : { version: version + 1 }) });
      if (version !== null && updated !== 1) throw Object.assign(new Error('VERSION_CONFLICT'), { code: 'VERSION_CONFLICT' });
      await recordAudit(trx, { actorUserId: req.user.id, action: AUDIT_ACTIONS.PROFILE_NAME_UPDATED, targetType: 'user', targetId: req.user.id });
    });
    const user = await db('users').where({ id: req.user.id }).first();
    const sessionId = await createSession(user.id, { deviceName: req.body.deviceName, userAgent: req.get('user-agent'), ipAddress: req.ip });
    setSessionCookies(res, user, sessionId);
    return res.json({ message: 'Profile updated successfully', user: publicUser(user) });
  } catch (error) {
    if (error.code === 'VERSION_CONFLICT') return res.status(409).json({ error: 'Resource was modified; reload before saving' });
    console.error('Profile name update error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function updatePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new passwords are required' });
  try {
    const user = await db('users').where({ id: req.user.id }).first();
    if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    if (await bcrypt.compare(newPassword, user.password_hash)) {
      return res.status(400).json({ error: 'New password must be different' });
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.transaction(async trx => {
      await trx('users').where({ id: req.user.id }).update({
        password_hash: passwordHash,
        session_version: user.session_version + 1,
        must_change_password: false,
        updated_at: trx.fn.now()
      });
      await recordAudit(trx, { actorUserId: req.user.id, action: AUDIT_ACTIONS.PROFILE_PASSWORD_CHANGED, targetType: 'user', targetId: req.user.id });
    });
    const updatedUser = await db('users').where({ id: req.user.id }).first();
    const sessionId = await createSession(updatedUser.id, { deviceName: req.body.deviceName, userAgent: req.get('user-agent'), ipAddress: req.ip });
    setSessionCookies(res, updatedUser, sessionId);
    return res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Profile password update error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function updateAvatar(req, res) {
  let newFilename;
  try {
    const user = await db('users').where({ id: req.user.id }).first();
    newFilename = await writeAvatar(req.user.id, req.body.imageDataUrl);
    await db.transaction(async trx => {
      await trx('users').where({ id: req.user.id }).update({ avatar_filename: newFilename, avatar_updated_at: trx.fn.now(), updated_at: trx.fn.now() });
      await recordAudit(trx, { actorUserId: req.user.id, action: AUDIT_ACTIONS.PROFILE_AVATAR_UPDATED, targetType: 'user', targetId: req.user.id });
    });
    await cleanupUserAvatars(req.user.id, newFilename).catch(error => {
      // Reconciliation is best-effort after the database points at the new file.
      console.error('Avatar orphan cleanup error:', error.message);
    });
    const updatedUser = await db('users').where({ id: req.user.id }).first();
    return res.json({ message: 'Avatar updated successfully', user: publicUser(updatedUser) });
  } catch (error) {
    if (newFilename) await removeAvatar(newFilename).catch(() => {});
    if (error instanceof AvatarError) {
      if (error.code === 'AVATAR_QUOTA_EXCEEDED') return res.status(413).json({ error: 'Avatar storage quota exceeded' });
      return res.status(400).json({ error: error.code === 'AVATAR_TOO_LARGE' ? 'Avatar is too large' : 'Invalid avatar image' });
    }
    console.error('Profile avatar update error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function signWaiver(req, res) {
  const { termsVersion, parqAnswers } = req.body;
  try {
    const existing = await db('signed_waivers').where({ user_id: req.user.id, terms_version: termsVersion }).first();
    if (existing) return res.status(200).json({ id: existing.id, termsVersion: existing.terms_version, signedAt: existing.signed_at });
    await db('signed_waivers').insert({
      user_id: req.user.id,
      terms_version: termsVersion,
      parq_answers: JSON.stringify(parqAnswers),
      ip_address: String(req.ip || '').slice(0, 64)
    }).onConflict(['user_id', 'terms_version']).ignore();
    const waiver = await db('signed_waivers').where({ user_id: req.user.id, terms_version: termsVersion }).first();
    return res.status(201).json({ id: waiver.id, termsVersion: waiver.terms_version, signedAt: waiver.signed_at });
  } catch (error) {
    console.error('Sign waiver error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function deleteAvatar(req, res) {
  try {
    const user = await db('users').where({ id: req.user.id }).first();
    await db.transaction(async trx => {
      await trx('users').where({ id: req.user.id }).update({ avatar_filename: null, avatar_updated_at: trx.fn.now(), updated_at: trx.fn.now() });
      await recordAudit(trx, { actorUserId: req.user.id, action: AUDIT_ACTIONS.PROFILE_AVATAR_REMOVED, targetType: 'user', targetId: req.user.id });
    });
    await cleanupUserAvatars(req.user.id).catch(error => {
      console.error('Avatar orphan cleanup error:', error.message);
    });
    return res.json({ message: 'Avatar removed successfully' });
  } catch (error) {
    console.error('Profile avatar removal error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function canViewAvatar(viewer, targetId) {
  if (viewer.id === targetId) return true;
  if (viewer.role === 'personal') return Boolean(await db('student_profiles').where({ personal_id: viewer.id, student_id: targetId }).first());
  if (viewer.role === 'student') return Boolean(await db('student_profiles').where({ student_id: viewer.id, personal_id: targetId }).first());
  return false;
}

async function getAvatar(req, res) {
  const targetId = Number(req.params.userId);
  try {
    if (!(await canViewAvatar(req.user, targetId))) return res.status(404).json({ error: 'Avatar not found' });
    const user = await db('users').select('avatar_filename').where({ id: targetId }).first();
    const avatarPath = resolveAvatarPath(user?.avatar_filename);
    if (!avatarPath || !fs.existsSync(avatarPath)) return res.status(404).json({ error: 'Avatar not found' });
    res.setHeader('Content-Type', 'image/webp');
    return res.sendFile(avatarPath);
  } catch (error) {
    console.error('Profile avatar fetch error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { deleteAvatar, getAvatar, signWaiver, updateAvatar, updateName, updatePassword };
