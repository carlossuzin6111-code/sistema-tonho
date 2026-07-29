const db = require('../database');
const { AUDIT_ACTIONS, recordAudit } = require('../services/auditService');
const { expectedVersion } = require('../services/optimisticLockService');

// Create a new exercise (Personal Trainer only)
async function createExercise(req, res) {
  const { name, gifUrl, description } = req.body;
  const personalId = req.user.id;

  if (!name) {
    return res.status(400).json({ error: 'Exercise name is required' });
  }

  try {
    const [insertedId] = await db('exercises').insert({
      personal_id: personalId,
      name,
      gif_url: gifUrl || null,
      description: description || null,
      is_custom: true
    });

    res.status(201).json({
      message: 'Exercise created successfully',
      exercise: {
        id: insertedId,
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
      const profile = await db('student_profiles').select('personal_id').where('student_id', userId).first();
      if (!profile) {
        return res.status(404).json({ error: 'No personal trainer linked to this student profile' });
      }
      personalId = profile.personal_id;
    }

    const exercises = await db('exercises').where('personal_id', personalId).orderBy('name', 'asc');

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
    const exercise = await db('exercises').where('id', exerciseId).first();
    if (!exercise) {
      return res.status(404).json({ error: 'Exercise not found' });
    }

    if (exercise.personal_id !== personalId) {
      return res.status(403).json({ error: 'Access denied: you do not own this exercise' });
    }

    await db.transaction(async trx => {
      await trx('exercises').where('id', exerciseId).del();
      await recordAudit(trx, {
        actorUserId: personalId,
        action: AUDIT_ACTIONS.CATALOG_EXERCISE_DELETED,
        targetType: 'catalog_exercise',
        targetId: exerciseId
      });
    });
    res.status(200).json({ message: 'Exercise deleted successfully' });
  } catch (err) {
    console.error('Delete exercise error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Toggle favorite status of an exercise (Personal Trainer only)
async function toggleFavorite(req, res) {
  const exerciseId = req.params.id;
  const personalId = req.user.id;

  try {
    const exercise = await db('exercises').where({ id: exerciseId, personal_id: personalId }).first();
    if (!exercise) {
      return res.status(404).json({ error: 'Exercise not found' });
    }

    const newFavoriteState = !exercise.is_favorite;
    const version = expectedVersion(req);
    if (Number.isNaN(version)) return res.status(400).json({ error: 'If-Match must contain a numeric version' });
    const updateData = {
      is_favorite: newFavoriteState,
      favorited_at: newFavoriteState ? new Date().toISOString() : null
    };

    const query = db('exercises').where({ id: exerciseId, personal_id: personalId });
    if (version !== null) query.where('version', version);
    const updated = await query.update({ ...updateData, ...(version === null ? {} : { version: version + 1 }) });
    if (version !== null && updated !== 1) return res.status(409).json({ error: 'Resource was modified; reload before saving' });

    res.status(200).json({
      message: newFavoriteState ? 'Exercise favorited' : 'Exercise unfavorited',
      is_favorite: newFavoriteState,
      version: version === null ? exercise.version : version + 1
    });
  } catch (err) {
    console.error('Toggle favorite error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Reorder exercises display order (Personal Trainer only)
async function reorderExercises(req, res) {
  const { ids } = req.body;
  const personalId = req.user.id;

  if (!Array.isArray(ids)) {
    return res.status(400).json({ error: 'ids must be an array' });
  }

  try {
    await db.transaction(async trx => {
      for (let i = 0; i < ids.length; i++) {
        await trx('exercises')
          .where({ id: ids[i], personal_id: personalId })
          .update({ display_order: i });
      }
    });

    res.status(200).json({ message: 'Exercises reordered successfully' });
  } catch (err) {
    console.error('Reorder exercises error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  createExercise,
  getExercises,
  deleteExercise,
  toggleFavorite,
  reorderExercises
};
