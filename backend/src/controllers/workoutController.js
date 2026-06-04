const { query } = require('../database');

// Create a new workout with optional exercises (Personal Trainer only)
async function createWorkout(req, res) {
  const { studentId, name, description, exercises } = req.body;
  const personalId = req.user.id;

  if (!studentId || !name) {
    return res.status(400).json({ error: 'Student ID and workout name are required' });
  }

  try {
    // Verify Personal Trainer owns this student
    const profile = await query.get(
      'SELECT id FROM student_profiles WHERE student_id = ? AND personal_id = ?',
      [studentId, personalId]
    );

    if (!profile) {
      return res.status(403).json({ error: 'Access denied: student not linked to this personal' });
    }

    // Insert workout
    const workoutResult = await query.run(
      'INSERT INTO workouts (student_id, personal_id, name, description) VALUES (?, ?, ?, ?)',
      [studentId, personalId, name, description || null]
    );
    const workoutId = workoutResult.id;

    // Insert exercises if provided
    if (exercises && Array.isArray(exercises)) {
      for (const ex of exercises) {
        if (ex.name && ex.sets) {
          await query.run(`
            INSERT INTO workout_exercises (
              workout_id, name, sets, reps, weight, rest_time, notes, exercise_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            workoutId,
            ex.name,
            ex.sets,
            ex.reps || '10',
            ex.weight || '',
            ex.restTime || '',
            ex.notes || '',
            ex.exerciseId || null
          ]);
        }
      }
    }

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
    // Verify ownership
    const workout = await query.get('SELECT * FROM workouts WHERE id = ?', [workoutId]);
    if (!workout) {
      return res.status(404).json({ error: 'Workout not found' });
    }

    if (workout.personal_id !== personalId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete workout (exercises will cascade delete)
    await query.run('DELETE FROM workouts WHERE id = ?', [workoutId]);

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
      // Verify Personal Trainer owns the workout
      const workout = await query.get('SELECT * FROM workouts WHERE id = ?', [workoutId]);
      if (!workout) {
        return res.status(404).json({ error: 'Workout not found' });
      }

      if (workout.personal_id !== personalId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const result = await query.run(`
        INSERT INTO workout_exercises (
          workout_id, name, sets, reps, weight, rest_time, notes, exercise_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        workoutId,
        name,
        sets,
        reps || '10',
        weight || '',
        restTime || '',
        notes || '',
        exerciseId || null
      ]);

    res.status(201).json({
      message: 'Exercise added successfully',
      exerciseId: result.id
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
    // Find exercise and verify Personal owns the workout
    const exercise = await query.get(`
      SELECT we.*, w.personal_id 
      FROM workout_exercises we
      JOIN workouts w ON we.workout_id = w.id
      WHERE we.id = ?
    `, [exerciseId]);

    if (!exercise) {
      return res.status(404).json({ error: 'Exercise not found' });
    }

    if (exercise.personal_id !== personalId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await query.run('DELETE FROM workout_exercises WHERE id = ?', [exerciseId]);

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

    // Fetch workouts
    const workouts = await query.all(
      'SELECT * FROM workouts WHERE student_id = ? ORDER BY created_at DESC',
      [studentId]
    );

    // Fetch exercises for each workout
    for (let i = 0; i < workouts.length; i++) {
      workouts[i].exercises = await query.all(`
        SELECT we.*, ex.gif_url, ex.description as exercise_description 
        FROM workout_exercises we
        LEFT JOIN exercises ex ON we.exercise_id = ex.id
        WHERE we.workout_id = ? 
        ORDER BY we.id ASC
      `, [workouts[i].id]);
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
