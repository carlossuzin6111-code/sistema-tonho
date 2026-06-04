const bcrypt = require('bcryptjs');
const { query } = require('../database');

// Create a new student (Personal Trainer only)
async function createStudent(req, res) {
  const { name, email, password, height, targetWeight, birthDate } = req.body;
  const personalId = req.user.id; // From JWT

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  try {
    // Check if email exists
    const existingUser = await query.get('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Insert student user
    const userResult = await query.run(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name, email, passwordHash, 'student']
    );
    const studentId = userResult.id;

    // Create student profile
    await query.run(
      'INSERT INTO student_profiles (student_id, personal_id, height, target_weight, birth_date) VALUES (?, ?, ?, ?, ?)',
      [studentId, personalId, height || null, targetWeight || null, birthDate || null]
    );

    res.status(201).json({
      message: 'Student account created successfully',
      student: {
        id: studentId,
        name,
        email,
        role: 'student'
      }
    });
  } catch (err) {
    console.error('Create student error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Get all students for a Personal Trainer
async function getStudents(req, res) {
  const personalId = req.user.id;

  try {
    // Fetch all students belonging to this Personal
    // Also join users to get the student's name, email
    // And get their latest measurement (weight) and unread messages from them
    const students = await query.all(`
      SELECT 
        u.id, 
        u.name, 
        u.email, 
        sp.height, 
        sp.target_weight, 
        sp.birth_date,
        (SELECT weight FROM measurements WHERE student_id = u.id ORDER BY recorded_at DESC LIMIT 1) as latest_weight,
        (SELECT recorded_at FROM measurements WHERE student_id = u.id ORDER BY recorded_at DESC LIMIT 1) as latest_weight_date,
        (SELECT COUNT(*) FROM chat_messages WHERE sender_id = u.id AND receiver_id = ? AND read_status = 0) as unread_messages
      FROM users u
      JOIN student_profiles sp ON u.id = sp.student_id
      WHERE sp.personal_id = ?
      ORDER BY u.name ASC
    `, [personalId, personalId]);

    res.status(200).json(students);
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
    // Verify permissions: Personal must own the profile, Student must be the profile
    if (userRole === 'student' && userId.toString() !== studentId.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (userRole === 'personal') {
      const profile = await query.get(
        'SELECT id FROM student_profiles WHERE student_id = ? AND personal_id = ?',
        [studentId, userId]
      );
      if (!profile) {
        return res.status(403).json({ error: 'Access denied: student not linked to this personal' });
      }
    }

    // Fetch user and profile details
    const student = await query.get(`
      SELECT 
        u.id, 
        u.name, 
        u.email, 
        sp.height, 
        sp.target_weight, 
        sp.birth_date,
        sp.personal_id
      FROM users u
      JOIN student_profiles sp ON u.id = sp.student_id
      WHERE u.id = ?
    `, [studentId]);

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Fetch measurements history
    const measurements = await query.all(
      'SELECT * FROM measurements WHERE student_id = ? ORDER BY recorded_at DESC',
      [studentId]
    );

    // Fetch active workouts
    const workouts = await query.all(
      'SELECT * FROM workouts WHERE student_id = ? ORDER BY created_at DESC',
      [studentId]
    );

    // For each workout, fetch exercises with GIF and technical description
    for (let i = 0; i < workouts.length; i++) {
      workouts[i].exercises = await query.all(`
        SELECT we.*, ex.gif_url, ex.description as exercise_description 
        FROM workout_exercises we
        LEFT JOIN exercises ex ON we.exercise_id = ex.id
        WHERE we.workout_id = ? 
        ORDER BY we.id ASC
      `, [workouts[i].id]);
    }

    res.status(200).json({
      student,
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
    // If Personal, verify they own this student
    if (userRole === 'personal') {
      const profile = await query.get(
        'SELECT id FROM student_profiles WHERE student_id = ? AND personal_id = ?',
        [targetStudentId, userId]
      );
      if (!profile) {
        return res.status(403).json({ error: 'Access denied: student not linked to this personal' });
      }
    }

    // Insert measurement
    const result = await query.run(`
      INSERT INTO measurements (
        student_id, weight, chest, waist, hips, biceps_l, biceps_r, thigh_l, thigh_r
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      targetStudentId,
      weight,
      chest || null,
      waist || null,
      hips || null,
      bicepsL || null,
      bicepsR || null,
      thighL || null,
      thighR || null
    ]);

    res.status(201).json({
      message: 'Measurements recorded successfully',
      measurementId: result.id
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
    // If Personal, verify they own this student
    if (userRole === 'personal') {
      const profile = await query.get(
        'SELECT id FROM student_profiles WHERE student_id = ? AND personal_id = ?',
        [studentId, userId]
      );
      if (!profile) {
        return res.status(403).json({ error: 'Access denied: student not linked to this personal' });
      }
    }

    const measurements = await query.all(
      'SELECT * FROM measurements WHERE student_id = ? ORDER BY recorded_at DESC',
      [studentId]
    );

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
    // Verify they own this student
    const profile = await query.get(
      'SELECT id FROM student_profiles WHERE student_id = ? AND personal_id = ?',
      [studentId, personalId]
    );
    if (!profile) {
      return res.status(403).json({ error: 'Access denied: student not linked to this personal' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    // Update password
    await query.run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, studentId]);

    res.status(200).json({ message: 'Senha redefinida com sucesso' });
  } catch (err) {
    console.error('Reset password error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  createStudent,
  getStudents,
  getStudentDetails,
  addMeasurement,
  getMeasurements,
  resetPassword
};
