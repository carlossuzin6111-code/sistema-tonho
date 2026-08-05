const db = require('../database');
const { AUDIT_ACTIONS, recordAudit } = require('../services/auditService');

// Create a new workout with optional exercises (Personal Trainer only)
async function createWorkout(req, res) {
  const { studentId, name, description, exercises } = req.body;
  const personalId = req.user.id;

  if (!studentId || !name) {
    return res.status(400).json({ error: 'Student ID and workout name are required' });
  }

  try {
    const profile = await db('student_profiles').select('id').where({student_id: studentId, personal_id: personalId}).first();

    if (!profile) {
      return res.status(403).json({ error: 'Access denied: student not linked to this personal' });
    }

    const workoutId = await db.transaction(async trx => {
      const [newWorkoutId] = await trx('workouts').insert({
        student_id: studentId,
        personal_id: personalId,
        name,
        description: description || null,
        status: 'draft'
      });

      if (exercises && Array.isArray(exercises)) {
        for (const ex of exercises) {
          if (ex.name && ex.sets) {
            await trx('workout_exercises').insert({
              workout_id: newWorkoutId,
              name: ex.name,
              sets: ex.sets,
              reps: ex.reps || '10',
              weight: ex.weight || '',
              rest_time: ex.restTime || '',
              notes: ex.notes || '',
              exercise_id: ex.exerciseId || null
            });
          }
        }
      }

      return newWorkoutId;
    });

    res.status(201).json({
      message: 'Workout created successfully',
      workoutId
    });
  } catch (err) {
    console.error('Create workout error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Delete a workout (Personal Trainer only)
async function deleteWorkout(req, res) {
  const workoutId = req.params.id;
  const personalId = req.user.id;

  try {
    const workout = await db('workouts').where('id', workoutId).first();
    if (!workout) {
      return res.status(404).json({ error: 'Workout not found' });
    }

    if (workout.personal_id !== personalId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await db.transaction(async trx => {
      await trx('workouts').where('id', workoutId).del();
      await recordAudit(trx, {
        actorUserId: personalId,
        action: AUDIT_ACTIONS.WORKOUT_DELETED,
        targetType: 'workout',
        targetId: workoutId,
        metadata: { studentId: workout.student_id }
      });
    });

    res.status(200).json({ message: 'Workout deleted successfully' });
  } catch (err) {
    console.error('Delete workout error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function updateWorkoutStatus(req, res) {
  const workoutId = req.params.id;
  const { status } = req.body;
  try {
    const result = await db.transaction(async trx => {
      const workout = await trx('workouts').where({ id: workoutId, personal_id: req.user.id }).first();
      if (!workout) return null;
      if (workout.status === status) return { changed: false, archivedWorkoutIds: [] };
      let automaticallyArchived = [];
      if (status === 'published') {
        automaticallyArchived = await trx('workouts')
          .select('id')
          .where({ student_id: workout.student_id, personal_id: req.user.id, status: 'published' })
          .whereNot('id', workoutId);
        await trx('workouts')
          .where({ student_id: workout.student_id, personal_id: req.user.id })
          .whereNot('id', workoutId)
          .where('status', 'published')
          .update({ status: 'archived', updated_at: trx.fn.now() });
      }
      await trx('workouts').where({ id: workoutId, personal_id: req.user.id }).update({ status, updated_at: trx.fn.now() });
      await recordAudit(trx, {
        actorUserId: req.user.id,
        action: AUDIT_ACTIONS.WORKOUT_STATUS_UPDATED,
        targetType: 'workout',
        targetId: workoutId,
        metadata: {
          studentId: workout.student_id,
          before: workout.status,
          after: status,
          automaticallyArchivedWorkoutIds: automaticallyArchived.map(item => item.id)
        }
      });
      return { changed: true, archivedWorkoutIds: automaticallyArchived.map(item => item.id) };
    });
    if (!result) return res.status(404).json({ error: 'Workout not found' });
    return res.status(200).json({
      message: result.changed ? 'Workout status updated successfully' : 'Workout status unchanged',
      status,
      ...result
    });
  } catch (err) {
    console.error('Update workout status error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function replaceWorkoutPeriodization(req, res) {
  const workoutId = Number(req.params.id);
  const microcycles = req.body.microcycles || [];
  try {
    const workout = await db('workouts').where({ id: workoutId, personal_id: req.user.id }).first();
    if (!workout) return res.status(404).json({ error: 'Workout not found' });
    if (microcycles.some((item, index) => !item || item.weekNumber !== index + 1 ||
      !Number.isFinite(Number(item.intensityPercent)) || Number(item.intensityPercent) <= 0 || Number(item.intensityPercent) > 200 ||
      !Number.isFinite(Number(item.volumeMultiplier)) || Number(item.volumeMultiplier) <= 0 || Number(item.volumeMultiplier) > 10 ||
      typeof item.label !== 'string' || item.label.trim().length < 1 || item.label.length > 120)) {
      return res.status(400).json({ error: 'Each microcycle requires sequential weekNumber, label, intensityPercent and volumeMultiplier within valid ranges' });
    }
    await db.transaction(async trx => {
      await trx('workout_microcycles').where({ workout_id: workoutId }).del();
      if (microcycles.length) await trx('workout_microcycles').insert(microcycles.map(item => ({
        workout_id: workoutId,
        week_number: item.weekNumber,
        label: item.label.trim(),
        intensity_percent: Number(item.intensityPercent),
        volume_multiplier: Number(item.volumeMultiplier),
        notes: item.notes ? String(item.notes).slice(0, 2000) : null
      })));
    });
    const saved = await db('workout_microcycles').where({ workout_id: workoutId }).orderBy('week_number');
    return res.status(200).json({ workoutId, microcycles: saved });
  } catch (err) {
    console.error('Replace workout periodization error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getWorkoutPeriodization(req, res) {
  const workoutId = Number(req.params.id);
  try {
    const workout = await db('workouts').where('id', workoutId).first();
    if (!workout) return res.status(404).json({ error: 'Workout not found' });
    if (req.user.role === 'personal' && workout.personal_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });
    if (req.user.role === 'student' && workout.student_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });
    const microcycles = await db('workout_microcycles').where({ workout_id: workoutId }).orderBy('week_number');
    return res.status(200).json({ workoutId, microcycles });
  } catch (err) {
    console.error('Get workout periodization error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Add an exercise to a workout (Personal Trainer only)
async function addExercise(req, res) {
  const workoutId = req.params.id;
  const { name, sets, reps, weight, restTime, notes, exerciseId } = req.body;
  const personalId = req.user.id;

  if (!name || !sets) {
    return res.status(400).json({ error: 'Exercise name and sets are required' });
  }

  try {
    const workout = await db('workouts').where('id', workoutId).first();
    if (!workout) {
      return res.status(404).json({ error: 'Workout not found' });
    }

    if (workout.personal_id !== personalId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const [insertedId] = await db('workout_exercises').insert({
      workout_id: workoutId,
      name,
      sets,
      reps: reps || '10',
      weight: weight || '',
      rest_time: restTime || '',
      notes: notes || '',
      exercise_id: exerciseId || null
    });

    res.status(201).json({
      message: 'Exercise added successfully',
      exerciseId: insertedId
    });
  } catch (err) {
    console.error('Add exercise error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Delete an exercise from a workout (Personal Trainer only)
async function deleteExercise(req, res) {
  const exerciseId = req.params.id;
  const personalId = req.user.id;

  try {
    const exercise = await db('workout_exercises as we')
      .join('workouts as w', 'we.workout_id', 'w.id')
      .select('we.*', 'w.personal_id')
      .where('we.id', exerciseId)
      .first();

    if (!exercise) {
      return res.status(404).json({ error: 'Exercise not found' });
    }

    if (exercise.personal_id !== personalId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await db.transaction(async trx => {
      await trx('workout_exercises').where('id', exerciseId).del();
      await recordAudit(trx, {
        actorUserId: personalId,
        action: AUDIT_ACTIONS.WORKOUT_EXERCISE_DELETED,
        targetType: 'workout_exercise',
        targetId: exerciseId,
        metadata: { workoutId: exercise.workout_id }
      });
    });

    res.status(200).json({ message: 'Exercise deleted successfully' });
  } catch (err) {
    console.error('Delete exercise error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Get workouts for a student (Student themselves or Personal)
async function getStudentWorkouts(req, res) {
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

    const workouts = await db('workouts').where({ student_id: studentId, status: 'published' }).orderBy('created_at', 'desc');

    for (let i = 0; i < workouts.length; i++) {
      workouts[i].exercises = await db('workout_exercises as we')
        .leftJoin('exercises as ex', 'we.exercise_id', 'ex.id')
        .select('we.*', 'ex.gif_url', 'ex.description as exercise_description')
        .where('we.workout_id', workouts[i].id)
        .orderBy('we.id', 'asc');
    }

    res.status(200).json(workouts);
  } catch (err) {
    console.error('Get workouts error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  createWorkout,
  deleteWorkout,
  updateWorkoutStatus,
  replaceWorkoutPeriodization,
  getWorkoutPeriodization,
  addExercise,
  deleteExercise,
  getStudentWorkouts
};
