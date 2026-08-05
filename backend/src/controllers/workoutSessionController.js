const db = require('../database');
const { recordAudit } = require('../services/auditService');
const metricsService = require('../services/metricsService');

function recordSessionMetric(action) {
  metricsService.increment('workout_sessions_total', { action });
}

async function checkStudentBelongsToPersonal(studentId, personalId) {
  const profile = await db('student_profiles')
    .where({ student_id: studentId, personal_id: personalId })
    .first();
  return Boolean(profile);
}

// Start a new workout session
async function startSession(req, res) {
  const { workoutId } = req.body || {};
  if (!workoutId) {
    return res.status(400).json({ error: 'workoutId is required' });
  }

  try {
    const workout = await db('workouts').where('id', workoutId).first();
    if (!workout) {
      return res.status(404).json({ error: 'Workout not found' });
    }

    if (req.user.role === 'student' && workout.student_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (req.user.role === 'personal') {
      const isAssigned = await checkStudentBelongsToPersonal(workout.student_id, req.user.id);
      if (!isAssigned) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Check for existing active session for this student
    const activeSession = await db('workout_sessions')
      .where({ student_id: workout.student_id, status: 'in_progress' })
      .first();

    if (activeSession) {
      return res.status(409).json({
        error: 'An active workout session is already in progress for this student',
        activeSessionId: activeSession.id
      });
    }

    const { session, exercises } = await db.transaction(async trx => {
      const [newSessionId] = await trx('workout_sessions').insert({
        workout_id: workout.id,
        student_id: workout.student_id,
        personal_id: workout.personal_id,
        workout_name: workout.name,
        status: 'in_progress',
        started_at: trx.fn.now(),
        last_activity_at: trx.fn.now(),
        created_at: trx.fn.now(),
        updated_at: trx.fn.now()
      });

      const workoutExercises = await trx('workout_exercises')
        .where('workout_id', workout.id)
        .orderBy('id', 'asc');

      const sessionExercises = [];
      for (const ex of workoutExercises) {
        const [insertedId] = await trx('workout_session_exercises').insert({
          session_id: newSessionId,
          workout_exercise_id: ex.id,
          exercise_name: ex.name,
          sets_completed: 0,
          sets_target: ex.sets || 1,
          reps_target: ex.reps || '',
          weight_used: ex.weight || '',
          rest_time: ex.rest_time || '',
          completed: false,
          notes: ex.notes || null
        });

        sessionExercises.push({
          id: insertedId,
          session_id: newSessionId,
          workout_exercise_id: ex.id,
          exercise_name: ex.name,
          sets_completed: 0,
          sets_target: ex.sets || 1,
          reps_target: ex.reps || '',
          weight_used: ex.weight || '',
          rest_time: ex.rest_time || '',
          completed: false,
          notes: ex.notes || null
        });
      }

      await recordAudit(trx, {
        actorUserId: req.user.id,
        action: 'workout_session.start',
        targetType: 'workout_session',
        targetId: newSessionId,
        metadata: { workoutId: workout.id, studentId: workout.student_id }
      });

      const createdSession = await trx('workout_sessions').where('id', newSessionId).first();
      return { session: createdSession, exercises: sessionExercises };
    });

    recordSessionMetric('started');
    return res.status(201).json({ ...session, exercises });
  } catch (error) {
    console.error('Start workout session error:', error.message);
    return res.status(500).json({ error: 'Failed to start workout session' });
  }
}

// Update progress for a specific exercise in an active session
async function updateExerciseProgress(req, res) {
  const sessionId = Number(req.params.id);
  const exerciseId = Number(req.params.exerciseId);
  const { setsCompleted, weightUsed, completed, notes } = req.body || {};

  try {
    const session = await db('workout_sessions').where('id', sessionId).first();
    if (!session) {
      return res.status(404).json({ error: 'Workout session not found' });
    }

    if (req.user.role === 'student' && session.student_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (req.user.role === 'personal') {
      const isAssigned = await checkStudentBelongsToPersonal(session.student_id, req.user.id);
      if (!isAssigned) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    if (session.status !== 'in_progress') {
      return res.status(400).json({ error: 'Cannot update exercise progress on a non-active session' });
    }

    const sessionExercise = await db('workout_session_exercises')
      .where({ id: exerciseId, session_id: sessionId })
      .first();

    if (!sessionExercise) {
      return res.status(404).json({ error: 'Session exercise not found' });
    }

    const updates = {};
    if (setsCompleted !== undefined && setsCompleted !== null) {
      updates.sets_completed = Number(setsCompleted);
    }
    if (weightUsed !== undefined && weightUsed !== null) {
      updates.weight_used = String(weightUsed);
    }
    if (completed !== undefined && completed !== null) {
      updates.completed = Boolean(completed);
    }
    if (notes !== undefined) {
      updates.notes = notes ? String(notes) : null;
    }

    if (Object.keys(updates).length > 0) {
      await db('workout_session_exercises')
        .where('id', exerciseId)
        .update(updates);
      await db('workout_sessions').where({ id: sessionId, status: 'in_progress' }).update({ last_activity_at: db.fn.now(), updated_at: db.fn.now() });
    }

    const updated = await db('workout_session_exercises').where('id', exerciseId).first();
    recordSessionMetric('exercise_updated');
    return res.status(200).json({ ...updated, completed: Boolean(updated.completed) });
  } catch (error) {
    console.error('Update exercise progress error:', error.message);
    return res.status(500).json({ error: 'Failed to update exercise progress' });
  }
}

async function keepSessionAlive(req, res) {
  try {
    const session = await db('workout_sessions').where({ id: req.params.id }).first();
    if (!session || session.status !== 'in_progress') return res.status(404).json({ error: 'Active workout session not found' });
    if (req.user.role === 'student' && session.student_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });
    if (req.user.role === 'personal' && session.personal_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });
    await db('workout_sessions').where({ id: session.id, status: 'in_progress' }).update({ last_activity_at: db.fn.now(), updated_at: db.fn.now() });
    recordSessionMetric('heartbeat');
    return res.json({ sessionId: session.id, lastActivityAt: new Date().toISOString() });
  } catch (error) {
    console.error('Keep session alive error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Complete an active workout session
async function completeSession(req, res) {
  const sessionId = Number(req.params.id);
  const { notes } = req.body || {};

  try {
    const session = await db('workout_sessions').where('id', sessionId).first();
    if (!session) {
      return res.status(404).json({ error: 'Workout session not found' });
    }

    if (req.user.role === 'student' && session.student_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (req.user.role === 'personal') {
      const isAssigned = await checkStudentBelongsToPersonal(session.student_id, req.user.id);
      if (!isAssigned) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    if (session.status !== 'in_progress') {
      return res.status(400).json({ error: 'Workout session is not in progress' });
    }

    const completedAt = new Date();
    const startedAt = new Date(session.started_at);
    const durationSeconds = Math.max(0, Math.floor((completedAt.getTime() - startedAt.getTime()) / 1000));

    await db.transaction(async trx => {
      await trx('workout_sessions')
        .where('id', sessionId)
        .update({
          status: 'completed',
          completed_at: completedAt,
          duration_seconds: durationSeconds,
          notes: notes !== undefined ? (notes ? String(notes) : null) : session.notes,
          updated_at: trx.fn.now()
        });

      await recordAudit(trx, {
        actorUserId: req.user.id,
        action: 'workout_session.complete',
        targetType: 'workout_session',
        targetId: sessionId,
        metadata: { durationSeconds, studentId: session.student_id }
      });
    });

    const updatedSession = await db('workout_sessions').where('id', sessionId).first();
    const exercises = await db('workout_session_exercises')
      .where('session_id', sessionId)
      .orderBy('id', 'asc');

    recordSessionMetric('completed');
    return res.status(200).json({ ...updatedSession, exercises });
  } catch (error) {
    console.error('Complete workout session error:', error.message);
    return res.status(500).json({ error: 'Failed to complete workout session' });
  }
}

// Cancel an active workout session
async function cancelSession(req, res) {
  const sessionId = Number(req.params.id);

  try {
    const session = await db('workout_sessions').where('id', sessionId).first();
    if (!session) {
      return res.status(404).json({ error: 'Workout session not found' });
    }

    if (req.user.role === 'student' && session.student_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (req.user.role === 'personal') {
      const isAssigned = await checkStudentBelongsToPersonal(session.student_id, req.user.id);
      if (!isAssigned) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    if (session.status !== 'in_progress') {
      return res.status(400).json({ error: 'Workout session is not in progress' });
    }

    await db.transaction(async trx => {
      await trx('workout_sessions')
        .where('id', sessionId)
        .update({
          status: 'cancelled',
          completed_at: trx.fn.now(),
          updated_at: trx.fn.now()
        });

      await recordAudit(trx, {
        actorUserId: req.user.id,
        action: 'workout_session.cancel',
        targetType: 'workout_session',
        targetId: sessionId,
        metadata: { studentId: session.student_id }
      });
    });

    const updatedSession = await db('workout_sessions').where('id', sessionId).first();
    recordSessionMetric('cancelled');
    return res.status(200).json(updatedSession);
  } catch (error) {
    console.error('Cancel workout session error:', error.message);
    return res.status(500).json({ error: 'Failed to cancel workout session' });
  }
}

// Get workout session history
async function getSessions(req, res) {
  let studentId = req.query.studentId ? Number(req.query.studentId) : null;
  const status = req.query.status;
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

  if (req.user.role === 'student') {
    studentId = req.user.id;
  } else if (req.user.role === 'personal') {
    if (!studentId) {
      return res.status(400).json({ error: 'studentId query parameter is required for personal trainers' });
    }
    const isAssigned = await checkStudentBelongsToPersonal(studentId, req.user.id);
    if (!isAssigned) {
      return res.status(403).json({ error: 'Access denied' });
    }
  }

  try {
    let query = db('workout_sessions')
      .where('student_id', studentId)
      .orderBy('started_at', 'desc')
      .limit(limit);

    if (status && ['in_progress', 'completed', 'cancelled'].includes(status)) {
      query = query.andWhere('status', status);
    }

    const sessions = await query;
    for (const s of sessions) {
      s.exercises = await db('workout_session_exercises')
        .where('session_id', s.id)
        .orderBy('id', 'asc');
    }

    return res.status(200).json(sessions);
  } catch (error) {
    console.error('Get workout sessions error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch workout sessions' });
  }
}

// Get single workout session details
async function getSessionDetails(req, res) {
  const sessionId = Number(req.params.id);

  try {
    const session = await db('workout_sessions').where('id', sessionId).first();
    if (!session) {
      return res.status(404).json({ error: 'Workout session not found' });
    }

    if (req.user.role === 'student' && session.student_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (req.user.role === 'personal') {
      const isAssigned = await checkStudentBelongsToPersonal(session.student_id, req.user.id);
      if (!isAssigned) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const exercises = await db('workout_session_exercises')
      .where('session_id', sessionId)
      .orderBy('id', 'asc');

    return res.status(200).json({ ...session, exercises });
  } catch (error) {
    console.error('Get workout session details error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch workout session details' });
  }
}

module.exports = {
  cancelSession,
  completeSession,
  getSessionDetails,
  getSessions,
  startSession,
  updateExerciseProgress,
  keepSessionAlive
};
