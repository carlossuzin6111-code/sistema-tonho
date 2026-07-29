const bcrypt = require('bcryptjs');
const db = require('../database');
const { isEmailUniqueConstraint, normalizeEmail } = require('../services/userIdentityService');
const { AUDIT_ACTIONS, recordAudit } = require('../services/auditService');
const crypto = require('crypto');

const INVITATION_TTL_MS = 72 * 60 * 60 * 1000;
const hashInvitationToken = token => crypto.createHash('sha256').update(token).digest('hex');

function withAvatarMetadata(user) {
  const { avatar_filename, avatar_updated_at, ...publicFields } = user;
  return { ...publicFields, hasAvatar: Boolean(avatar_filename), avatarUpdatedAt: avatar_updated_at || null };
}

async function inviteStudent(req, res) {
  if (typeof req.body?.email !== 'string' || !req.body.email.trim()) {
    return res.status(400).json({ error: 'Email is required' });
  }
  const email = normalizeEmail(req.body.email);
  const personalId = req.user.id;
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
  const rawToken = crypto.randomBytes(32).toString('base64url');
  try {
    const invitation = await db.transaction(async trx => {
      const existingUser = await trx('users').select('id').where('email', email).first();
      if (existingUser) { const error = new Error('Email already registered'); error.code = 'EMAIL_ALREADY_REGISTERED'; throw error; }
      await trx('student_invitations').where({ email, personal_id: personalId }).whereNull('claimed_at').del();
      const [id] = await trx('student_invitations').insert({ email, personal_id: personalId, token_hash: hashInvitationToken(rawToken), expires_at: expiresAt.toISOString() });
      await recordAudit(trx, { actorUserId: personalId, action: 'student.invitation_created', targetType: 'student_invitation', targetId: id, metadata: { email, expiresAt: expiresAt.toISOString() } });
      return { id };
    });
    const response = { message: 'Student invitation created successfully', invitationId: invitation.id, expiresAt: expiresAt.toISOString() };
    if (process.env.NODE_ENV !== 'production') response.token = rawToken;
    return res.status(201).json(response);
  } catch (error) {
    if (error.code === 'EMAIL_ALREADY_REGISTERED') return res.status(400).json({ error: error.message });
    console.error('Invite student error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Create a new student (Personal Trainer only)
async function createStudent(req, res) {
  const { name, email, password, height, targetWeight, birthDate } = req.body;
  const personalId = req.user.id; // From JWT

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  try {
    const normalizedEmail = normalizeEmail(email);
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const studentId = await db.transaction(async trx => {
      // Check if email exists inside transaction
      const existingUser = await trx('users').select('id').where('email', normalizedEmail).first();
      if (existingUser) {
        const err = new Error('Email already registered');
        err.code = 'EMAIL_ALREADY_REGISTERED';
        throw err;
      }

      // Insert student user
      const [newStudentId] = await trx('users').insert({
        name,
        email: normalizedEmail,
        password_hash: passwordHash,
        role: 'student',
        must_change_password: true
      });

      // Create student profile
      await trx('student_profiles').insert({
        student_id: newStudentId,
        personal_id: personalId,
        height: height || null,
        target_weight: targetWeight || null,
        birth_date: birthDate || null
      });

      return newStudentId;
    });

    res.status(201).json({
      message: 'Student account created successfully',
      student: {
        id: studentId,
        name,
        email: normalizedEmail,
        role: 'student'
      }
    });
  } catch (err) {
    if (err.code === 'EMAIL_ALREADY_REGISTERED' || isEmailUniqueConstraint(err)) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    console.error('Create student error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Get all students for a Personal Trainer
async function getStudents(req, res) {
  const personalId = req.user.id;

  try {
    const students = await db('users as u')
      .join('student_profiles as sp', 'u.id', 'sp.student_id')
      .select('u.id', 'u.name', 'u.email', 'u.avatar_filename', 'u.avatar_updated_at', 'sp.height', 'sp.target_weight', 'sp.birth_date')
      .select(db.raw('(SELECT weight FROM measurements WHERE student_id = u.id ORDER BY recorded_at DESC LIMIT 1) as latest_weight'))
      .select(db.raw('(SELECT recorded_at FROM measurements WHERE student_id = u.id ORDER BY recorded_at DESC LIMIT 1) as latest_weight_date'))
      .select(db.raw('(SELECT COUNT(*) FROM chat_messages WHERE sender_id = u.id AND receiver_id = ? AND read_status = 0) as unread_messages', [personalId]))
      .where('sp.personal_id', personalId)
      .orderBy('u.name', 'asc');

    res.status(200).json(students.map(withAvatarMetadata));
  } catch (err) {
    console.error('Get students error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Get specific student details (Personal or the Student themselves)
async function getStudentDetails(req, res) {
  const studentId = req.params.id;
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    if (userRole === 'student' && userId.toString() !== studentId.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (userRole === 'personal') {
      const profile = await db('student_profiles').select('id').where({student_id: studentId, personal_id: userId}).first();
      if (!profile) {
        return res.status(403).json({ error: 'Access denied: student not linked to this personal' });
      }
    }

    const student = await db('users as u')
      .join('student_profiles as sp', 'u.id', 'sp.student_id')
      .select('u.id', 'u.name', 'u.email', 'u.avatar_filename', 'u.avatar_updated_at', 'sp.height', 'sp.target_weight', 'sp.birth_date', 'sp.personal_id')
      .where('u.id', studentId)
      .first();

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const measurements = await db('measurements').where('student_id', studentId).orderBy('recorded_at', 'desc');

    const workouts = await db('workouts').where('student_id', studentId).orderBy('created_at', 'desc');

    for (let i = 0; i < workouts.length; i++) {
      workouts[i].exercises = await db('workout_exercises as we')
        .leftJoin('exercises as ex', 'we.exercise_id', 'ex.id')
        .select('we.*', 'ex.gif_url', 'ex.description as exercise_description')
        .where('we.workout_id', workouts[i].id)
        .orderBy('we.id', 'asc');
    }

    res.status(200).json({
      student: withAvatarMetadata(student),
      measurements,
      workouts
    });
  } catch (err) {
    console.error('Get student details error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Add measurement record (Student or Personal)
async function addMeasurement(req, res) {
  const { studentId, weight, chest, waist, hips, bicepsL, bicepsR, thighL, thighR } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;

  const targetStudentId = userRole === 'student' ? userId : studentId;

  if (!targetStudentId) {
    return res.status(400).json({ error: 'Student ID is required' });
  }

  if (!weight) {
    return res.status(400).json({ error: 'Weight is required' });
  }

  try {
    if (userRole === 'personal') {
      const profile = await db('student_profiles').select('id').where({student_id: targetStudentId, personal_id: userId}).first();
      if (!profile) {
        return res.status(403).json({ error: 'Access denied: student not linked to this personal' });
      }
    }

    const measurementId = await db.transaction(async trx => {
      const [insertedId] = await trx('measurements').insert({
        student_id: targetStudentId,
        weight,
        chest: chest || null,
        waist: waist || null,
        hips: hips || null,
        biceps_l: bicepsL || null,
        biceps_r: bicepsR || null,
        thigh_l: thighL || null,
        thigh_r: thighR || null
      });
      await recordAudit(trx, {
        actorUserId: userId,
        action: AUDIT_ACTIONS.MEASUREMENT_CREATED,
        targetType: 'measurement',
        targetId: insertedId,
        metadata: { studentId: Number(targetStudentId) }
      });
      return insertedId;
    });

    res.status(201).json({
      message: 'Measurements recorded successfully',
      measurementId
    });
  } catch (err) {
    console.error('Add measurement error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Get measurements history (Student or Personal)
async function getMeasurements(req, res) {
  const userId = req.user.id;
  const userRole = req.user.role;
  const studentId = userRole === 'student' ? userId : req.query.studentId;

  if (!studentId) {
    return res.status(400).json({ error: 'Student ID is required' });
  }

  try {
    if (userRole === 'personal') {
      const profile = await db('student_profiles').select('id').where({student_id: studentId, personal_id: userId}).first();
      if (!profile) {
        return res.status(403).json({ error: 'Access denied: student not linked to this personal' });
      }
    }

    const measurements = await db('measurements').where('student_id', studentId).orderBy('recorded_at', 'desc');

    res.status(200).json(measurements);
  } catch (err) {
    console.error('Get measurements error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Reset student password
async function resetPassword(req, res) {
  const studentId = req.params.id;
  const { newPassword } = req.body;
  const personalId = req.user.id;
  const userRole = req.user.role;

  if (userRole !== 'personal') {
    return res.status(403).json({ error: 'Access denied: only personal can reset password' });
  }

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'A nova senha é obrigatória e deve ter pelo menos 6 caracteres' });
  }

  try {
    const profile = await db('student_profiles').select('id').where({student_id: studentId, personal_id: personalId}).first();
    if (!profile) {
      return res.status(403).json({ error: 'Access denied: student not linked to this personal' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    await db.transaction(async trx => {
      await trx('users').where('id', studentId).update({
        password_hash: passwordHash,
        session_version: trx.raw('session_version + 1'),
        must_change_password: true,
        updated_at: trx.fn.now()
      });
      await recordAudit(trx, {
        actorUserId: personalId,
        action: AUDIT_ACTIONS.PASSWORD_RESET,
        targetType: 'student',
        targetId: studentId
      });
    });

    res.status(200).json({ message: 'Senha redefinida com sucesso' });
  } catch (err) {
    console.error('Reset password error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  inviteStudent,
  createStudent,
  getStudents,
  getStudentDetails,
  addMeasurement,
  getMeasurements,
  resetPassword
};
