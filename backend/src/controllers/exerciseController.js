const { query } = require('../database');

// Create a new exercise (Personal Trainer only)
async function createExercise(req, res) {
  const { name, gifUrl, description } = req.body;
  const personalId = req.user.id;

  if (!name) {
    return res.status(400).json({ error: 'Exercise name is required' });
  }

  try {
    const result = await query.run(`
      INSERT INTO exercises (personal_id, name, gif_url, description)
      VALUES (?, ?, ?, ?)
    `, [personalId, name, gifUrl || null, description || null]);

    res.status(201).json({
      message: 'Exercise created successfully',
      exercise: {
        id: result.id,
        name,
        gifUrl: gifUrl || null,
        description: description || null
      }
    });
  } catch (err) {
    console.error('Create exercise error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Get exercises for Personal Trainer or linked Student
async function getExercises(req, res) {
  const userId = req.user.id;
  const role = req.user.role;

  try {
    let personalId = userId;

    if (role === 'student') {
      // Find the personal trainer for this student
      const profile = await query.get(
        'SELECT personal_id FROM student_profiles WHERE student_id = ?',
        [userId]
      );
      if (!profile) {
        return res.status(404).json({ error: 'No personal trainer linked to this student profile' });
      }
      personalId = profile.personal_id;
    }

    const exercises = await query.all(
      'SELECT * FROM exercises WHERE personal_id = ? ORDER BY name ASC',
      [personalId]
    );

    res.status(200).json(exercises);
  } catch (err) {
    console.error('Get exercises error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Delete an exercise (Personal Trainer only)
async function deleteExercise(req, res) {
  const exerciseId = req.params.id;
  const personalId = req.user.id;

  try {
    // Verify ownership
    const exercise = await query.get('SELECT * FROM exercises WHERE id = ?', [exerciseId]);
    if (!exercise) {
      return res.status(404).json({ error: 'Exercise not found' });
    }

    if (exercise.personal_id !== personalId) {
      return res.status(403).json({ error: 'Access denied: you do not own this exercise' });
    }

    await query.run('DELETE FROM exercises WHERE id = ?', [exerciseId]);
    res.status(200).json({ message: 'Exercise deleted successfully' });
  } catch (err) {
    console.error('Delete exercise error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  createExercise,
  getExercises,
  deleteExercise
};
