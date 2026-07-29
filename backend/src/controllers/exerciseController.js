const db = require('../database');
const { AUDIT_ACTIONS, recordAudit } = require('../services/auditService');
const { expectedVersion } = require('../services/optimisticLockService');
const { embeddedImageBytes, hasMediaQuota } = require('../services/mediaQuotaService');

// Create a new exercise (Personal Trainer only)
async function createExercise(req, res) {
  const { name, gifUrl, description } = req.body;
  const personalId = req.user.id;

  if (!name) {
    return res.status(400).json({ error: 'Exercise name is required' });
  }

  try {
    const [{ usedBytes }] = await db('exercises')
      .where({ personal_id: personalId, is_custom: 1 })
      .select(db.raw('COALESCE(SUM(LENGTH(gif_url)), 0) as usedBytes'));
    if (!hasMediaQuota(usedBytes, embeddedImageBytes(gifUrl))) {
      return res.status(413).json({ error: 'Exercise media quota exceeded' });
    }
    const [insertedId] = await db('exercises').insert({
      personal_id: personalId,
      name,
      gif_url: gifUrl || null,
      description: description || null,
      is_custom: true,
      catalog_scope: 'custom',
      canonical_name: name.trim().toLowerCase()
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

    const scope = req.query.scope === 'custom' ? 'custom' : req.query.scope === 'global' ? 'global' : null;
    const query = db('exercises').where('personal_id', personalId).whereNull('archived_at');
    if (scope) query.where('catalog_scope', scope);
    const exercises = await query.orderBy('name', 'asc');

    res.status(200).json(exercises);
  } catch (err) {
    console.error('Get exercises error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function getCatalogGovernance(req, res) {
  try {
    const groups = await db('exercises')
      .where('personal_id', req.user.id)
      .whereNull('archived_at')
      .select('canonical_name')
      .count({ count: '*' })
      .groupBy('canonical_name')
      .orderBy('canonical_name');
    const duplicates = [];
    for (const group of groups.filter(item => Number(item.count) > 1)) {
      const entries = await db('exercises').where({ personal_id: req.user.id, canonical_name: group.canonical_name }).whereNull('archived_at').orderBy('id');
      duplicates.push({ canonicalName: group.canonical_name, count: entries.length, exercises: entries });
    }
    return res.status(200).json({ duplicates });
  } catch (err) {
    console.error('Catalog governance list error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function mergeCatalogExercises(req, res) {
  const sourceId = Number(req.body.sourceId);
  const targetId = Number(req.body.targetId);
  if (!sourceId || !targetId || sourceId === targetId) return res.status(400).json({ error: 'sourceId and targetId must be different positive integers' });
  try {
    const [source, target] = await Promise.all([
      db('exercises').where({ id: sourceId, personal_id: req.user.id }).first(),
      db('exercises').where({ id: targetId, personal_id: req.user.id }).first()
    ]);
    if (!source || !target) return res.status(404).json({ error: 'Source or target exercise not found' });
    if (source.canonical_name !== target.canonical_name) return res.status(400).json({ error: 'Exercises must share the same canonical name to be merged' });
    await db.transaction(async trx => {
      await trx('workout_exercises').where({ exercise_id: sourceId }).update({ exercise_id: targetId });
      await trx('exercises').where({ id: sourceId, personal_id: req.user.id }).update({ archived_at: trx.fn.now() });
      await recordAudit(trx, { actorUserId: req.user.id, action: AUDIT_ACTIONS.CATALOG_EXERCISE_MERGED, targetType: 'catalog_exercise', targetId, metadata: { sourceId } });
    });
    return res.status(200).json({ message: 'Exercises merged successfully', sourceId, targetId });
  } catch (err) {
    console.error('Catalog governance merge error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
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
  ,getCatalogGovernance
  ,mergeCatalogExercises
};
