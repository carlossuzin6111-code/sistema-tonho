const bcrypt = require('bcryptjs');
const fs = require('fs');
const db = require('../database');
const { setSessionCookies } = require('../services/sessionService');
const { AUDIT_ACTIONS, recordAudit } = require('../services/auditService');
const { AvatarError, removeAvatar, resolveAvatarPath, writeAvatar } = require('../services/avatarService');

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    hasAvatar: Boolean(user.avatar_filename),
    avatarUpdatedAt: user.avatar_updated_at || null
  };
}

async function updateName(req, res) {
  if (typeof req.body.name !== 'string') return res.status(400).json({ error: 'Name is required' });
  const name = req.body.name.trim().replace(/\s+/g, ' ');
  if (name.length < 2) return res.status(400).json({ error: 'Name must have at least 2 characters' });
  try {
    await db.transaction(async trx => {
      await trx('users').where({ id: req.user.id }).update({ name, updated_at: trx.fn.now() });
      await recordAudit(trx, { actorUserId: req.user.id, action: AUDIT_ACTIONS.PROFILE_NAME_UPDATED, targetType: 'user', targetId: req.user.id });
    });
    const user = await db('users').where({ id: req.user.id }).first();
    setSessionCookies(res, user);
    return res.json({ message: 'Profile updated successfully', user: publicUser(user) });
  } catch (error) {
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
        updated_at: trx.fn.now()
      });
      await recordAudit(trx, { actorUserId: req.user.id, action: AUDIT_ACTIONS.PROFILE_PASSWORD_CHANGED, targetType: 'user', targetId: req.user.id });
    });
    const updatedUser = await db('users').where({ id: req.user.id }).first();
    setSessionCookies(res, updatedUser);
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
    await removeAvatar(user.avatar_filename);
    const updatedUser = await db('users').where({ id: req.user.id }).first();
    return res.json({ message: 'Avatar updated successfully', user: publicUser(updatedUser) });
  } catch (error) {
    if (newFilename) await removeAvatar(newFilename).catch(() => {});
    if (error instanceof AvatarError) return res.status(400).json({ error: error.code === 'AVATAR_TOO_LARGE' ? 'Avatar is too large' : 'Invalid avatar image' });
    console.error('Profile avatar update error:', error.message);
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
    await removeAvatar(user.avatar_filename);
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

module.exports = { deleteAvatar, getAvatar, updateAvatar, updateName, updatePassword };
