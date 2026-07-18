const bcrypt = require('bcryptjs');
const db = require('../database');
const { findUnusedAccessKeyId } = require('../services/accessKeyService');
const { clearSessionCookies, setSessionCookies } = require('../services/sessionService');
const { isEmailUniqueConstraint, normalizeEmail } = require('../services/userIdentityService');

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
        .update({ used_at: trx.fn.now() });

      if (claimedKeys !== 1) {
        throw new RegistrationError('ACCESS_KEY_ALREADY_USED');
      }

      const [userId] = await trx('users').insert({
        name,
        email: normalizedEmail,
        password_hash: passwordHash,
        role: 'personal'
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

    const user = { id: insertedId, name, email: normalizedEmail, role: 'personal' };
    setSessionCookies(res, user);

    res.status(201).json({
      message: 'Personal Trainer registered successfully',
      user
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
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
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
      .select('id', 'name', 'email', 'role', 'created_at')
      .where('id', req.user.id)
      .first();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.status(200).json(user);
  } catch (err) {
    console.error('getMe error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  registerPersonal,
  login,
  logout,
  getMe
};
