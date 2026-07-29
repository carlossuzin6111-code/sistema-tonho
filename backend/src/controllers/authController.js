const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../database');
const { findUnusedAccessKeyId } = require('../services/accessKeyService');
const { clearSessionCookies, setSessionCookies } = require('../services/sessionService');
const { isEmailUniqueConstraint, normalizeEmail } = require('../services/userIdentityService');
const { recordAudit, AUDIT_ACTIONS } = require('../services/auditService');
const { sendEmailVerification } = require('../services/emailDeliveryService');

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const hashVerificationToken = token => crypto.createHash('sha256').update(token).digest('hex');

class RegistrationError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

async function registerPersonal(req, res) {
  const { name, email, password, accessKey } = req.body;

  if (!name || !email || !password || !accessKey) {
    return res.status(400).json({ error: 'Name, email, password, and accessKey are required' });
  }

  try {
    const normalizedEmail = normalizeEmail(email);
    const accessKeyId = await findUnusedAccessKeyId(db, accessKey);
    if (!accessKeyId) {
      return res.status(403).json({ error: 'Access Key Inválida' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const insertedId = await db.transaction(async trx => {
      const existingUser = await trx('users').select('id').where('email', normalizedEmail).first();
      if (existingUser) {
        throw new RegistrationError('EMAIL_ALREADY_REGISTERED');
      }

      const claimedKeys = await trx('registration_keys')
        .where({ id: accessKeyId })
        .whereNull('used_at')
        .where('expires_at', '>', trx.fn.now())
        .update({ used_at: trx.fn.now() });

      if (claimedKeys !== 1) {
        throw new RegistrationError('ACCESS_KEY_ALREADY_USED');
      }

      const [userId] = await trx('users').insert({
        name,
        email: normalizedEmail,
        password_hash: passwordHash,
        role: 'personal',
        must_change_password: false
      });

      await trx('registration_keys')
        .where({ id: accessKeyId })
        .update({ used_by: userId });

      return userId;
    });

    // Seed default exercises for the new personal trainer
    if (db.seedDefaultExercisesForPersonal) {
      await db.seedDefaultExercisesForPersonal(db, insertedId);
    }

    const verificationToken = crypto.randomBytes(32).toString('base64url');
    const verificationExpiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS).toISOString();
    await db('email_verification_tokens').insert({ user_id: insertedId, token_hash: hashVerificationToken(verificationToken), expires_at: verificationExpiresAt });
    const delivery = await sendEmailVerification({ email: normalizedEmail, token: verificationToken, expiresAt: verificationExpiresAt });

    const user = { id: insertedId, name, email: normalizedEmail, role: 'personal', mustChangePassword: false };
    setSessionCookies(res, user);

    res.status(201).json({
      message: 'Personal Trainer registered successfully',
      user: { ...user, emailVerified: false, verificationDelivery: delivery.sent ? 'sent' : 'not_configured', ...(process.env.NODE_ENV !== 'production' ? { verificationToken } : {}) }
    });
  } catch (err) {
    if (err.code === 'EMAIL_ALREADY_REGISTERED' || isEmailUniqueConstraint(err)) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    if (err.code === 'ACCESS_KEY_ALREADY_USED') {
      return res.status(403).json({ error: 'Access Key Inválida' });
    }
    console.error('Registration error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const normalizedEmail = normalizeEmail(email);
    // Find user
    const user = await db('users').where('email', normalizedEmail).first();
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    setSessionCookies(res, user);

    res.status(200).json({
      message: 'Login successful',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        mustChangePassword: Boolean(user.must_change_password),
        emailVerified: Boolean(user.email_verified_at)
      }
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

function logout(req, res) {
  clearSessionCookies(res);
  res.setHeader('Clear-Site-Data', '"cache", "cookies"');
  return res.status(200).json({ message: 'Logout successful' });
}

async function getMe(req, res) {
  try {
    const user = await db('users')
      .select('id', 'name', 'email', 'role', 'created_at', 'avatar_filename', 'avatar_updated_at', 'must_change_password', 'email_verified_at')
      .where('id', req.user.id)
      .first();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.status(200).json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      mustChangePassword: Boolean(user.must_change_password),
      emailVerified: Boolean(user.email_verified_at),
      ...(req.user.isImpersonation ? { impersonation: { actorUserId: req.user.impersonatedBy, eventId: req.user.impersonationId } } : {}),
      created_at: user.created_at,
      hasAvatar: Boolean(user.avatar_filename),
      avatarUpdatedAt: user.avatar_updated_at || null
    });
  } catch (err) {
    console.error('getMe error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function forgotPassword(req, res) {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const normalizedEmail = normalizeEmail(email);
    const user = await db('users').where('email', normalizedEmail).first();

    const genericMessage = 'Se o e-mail estiver cadastrado, as instruções para redefinição de senha foram geradas.';

    if (!user) {
      return res.status(200).json({ message: genericMessage });
    }

    if (!user.email_verified_at) {
      return res.status(200).json({ message: genericMessage });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await db('password_reset_tokens').insert({
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString()
    });

    await recordAudit(db, {
      actorUserId: user.id,
      action: AUDIT_ACTIONS.FORGOT_PASSWORD_REQUESTED,
      targetType: 'user',
      targetId: user.id
    });

    const isTestOrDev = process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';
    return res.status(200).json({
      message: genericMessage,
      ...(isTestOrDev ? { resetToken: rawToken } : {})
    });
  } catch (err) {
    console.error('forgotPassword error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function resetPasswordWithToken(req, res) {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token and newPassword are required' });
  }

  if (newPassword.length < 10) {
    return res.status(400).json({ error: 'Password must be at least 10 characters long' });
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const resetRecord = await db('password_reset_tokens')
      .where({ token_hash: tokenHash })
      .whereNull('used_at')
      .first();

    const expiresAt = resetRecord && (/^\d+$/.test(String(resetRecord.expires_at))
      ? Number(resetRecord.expires_at)
      : new Date(resetRecord.expires_at).getTime());
    if (!resetRecord || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return res.status(400).json({ error: 'Token de redefinição de senha inválido ou expirado' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    await db.transaction(async trx => {
      await trx('users')
        .where({ id: resetRecord.user_id })
        .update({
          password_hash: passwordHash,
          session_version: trx.raw('session_version + 1'),
          must_change_password: false,
          updated_at: trx.fn.now()
        });

      await trx('password_reset_tokens')
        .where({ id: resetRecord.id })
        .update({ used_at: trx.fn.now() });

      await recordAudit(trx, {
        actorUserId: resetRecord.user_id,
        action: AUDIT_ACTIONS.PASSWORD_RESET_COMPLETED,
        targetType: 'user',
        targetId: resetRecord.user_id
      });
    });

    return res.status(200).json({ message: 'Senha redefinida com sucesso. Faça login com a nova senha.' });
  } catch (err) {
    console.error('resetPasswordWithToken error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function verifyEmail(req, res) {
  const tokenHash = hashVerificationToken(req.body.token);
  try {
    const verified = await db.transaction(async trx => {
      const record = await trx('email_verification_tokens').where({ token_hash: tokenHash }).whereNull('used_at').first();
      if (!record || new Date(record.expires_at).getTime() <= Date.now()) return false;
      await trx('users').where({ id: record.user_id }).update({ email_verified_at: trx.fn.now(), updated_at: trx.fn.now() });
      const claimed = await trx('email_verification_tokens').where({ id: record.id, used_at: null }).update({ used_at: trx.fn.now(), updated_at: trx.fn.now() });
      return claimed === 1;
    });
    if (!verified) return res.status(400).json({ error: 'Invalid or expired email verification token' });
    return res.status(200).json({ message: 'Email verified successfully' });
  } catch (error) {
    console.error('Verify email error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  registerPersonal,
  login,
  logout,
  getMe,
  forgotPassword,
  resetPasswordWithToken,
  verifyEmail
};
