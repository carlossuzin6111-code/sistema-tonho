const db = require('../database');

function numeric(value) {
  const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function estimateEpleyOneRepMax(weight, reps) {
  if (!(weight > 0) || !(reps >= 1) || reps > 30) return null;
  return Number((weight * (1 + reps / 30)).toFixed(2));
}

async function getProgression(req, res) {
  const requestedStudent = req.query.studentId ? Number(req.query.studentId) : req.user.id;
  if (!Number.isInteger(requestedStudent) || requestedStudent < 1) return res.status(400).json({ error: 'studentId must be a positive integer' });
  try {
    if (req.user.role === 'student' && requestedStudent !== req.user.id) return res.status(403).json({ error: 'Progression access forbidden' });
    if (req.user.role === 'personal') {
      const linked = await db('student_profiles').where({ student_id: requestedStudent, personal_id: req.user.id }).first();
      if (!linked) return res.status(403).json({ error: 'Progression access forbidden' });
    } else if (req.user.role !== 'student') return res.status(403).json({ error: 'Progression access forbidden' });
    const rows = await db('workout_session_exercises as wse')
      .join('workout_sessions as ws', 'ws.id', 'wse.session_id')
      .select('wse.exercise_name', 'wse.sets_completed', 'wse.reps_target', 'wse.weight_used', 'ws.completed_at')
      .where({ 'ws.student_id': requestedStudent, 'ws.status': 'completed' })
      .orderBy('ws.completed_at', 'asc');
    const grouped = new Map();
    for (const row of rows) {
      const reps = numeric(row.reps_target);
      const weight = numeric(row.weight_used);
      const volume = Number(row.sets_completed || 0) * reps * weight;
      const estimatedOneRepMax = estimateEpleyOneRepMax(weight, reps);
      const current = grouped.get(row.exercise_name) || { exerciseName: row.exercise_name, totalVolume: 0, personalRecordVolume: 0, estimatedOneRepMax: null, history: [], lastCompletedAt: null };
      current.totalVolume += volume;
      if (volume >= current.personalRecordVolume) current.personalRecordVolume = volume;
      current.lastSets = row.sets_completed;
      current.lastReps = row.reps_target;
      current.lastWeight = row.weight_used;
      current.lastVolume = volume;
      current.lastCompletedAt = row.completed_at;
      if (estimatedOneRepMax !== null) current.estimatedOneRepMax = Math.max(current.estimatedOneRepMax || 0, estimatedOneRepMax);
      current.history.push({ completedAt: row.completed_at, sets: row.sets_completed, reps, weight, volume, estimatedOneRepMax });
      grouped.set(row.exercise_name, current);
    }
    return res.json({ studentId: requestedStudent, oneRepMaxFormula: 'Epley: weight × (1 + reps ÷ 30), valid for 1–30 repetitions', exercises: [...grouped.values()].map(item => ({ ...item, suggestedTrainingWeight: item.estimatedOneRepMax ? Number((item.estimatedOneRepMax * 0.7).toFixed(2)) : null })) });
  } catch (error) {
    console.error('Get progression error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { estimateEpleyOneRepMax, getProgression };
