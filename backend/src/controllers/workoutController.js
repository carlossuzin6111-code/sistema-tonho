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
        description: description || null
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

    const workouts = await db('workouts').where('student_id', studentId).orderBy('created_at', 'desc');

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
  addExercise,
  deleteExercise,
  getStudentWorkouts
};
