const db = require('../database');

function rangeDates(req) {
  const end = req.query.to ? new Date(`${req.query.to}T23:59:59.999Z`) : new Date();
  const start = req.query.from ? new Date(`${req.query.from}T00:00:00.000Z`) : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) return null;
  return { start: start.toISOString(), end: end.toISOString() };
}

async function getAdherence(req, res) {
  const range = rangeDates(req);
  if (!range) return res.status(400).json({ error: 'Invalid adherence date range' });
  try {
    const students = req.user.role === 'student' ? [{ id: req.user.id }] : req.user.role === 'personal' ? await db('student_profiles').select('student_id as id').where({ personal_id: req.user.id }) : [];
    if (req.user.role !== 'student' && req.user.role !== 'personal') return res.status(403).json({ error: 'Adherence access forbidden' });
    const result = [];
    for (const student of students) {
      const plannedRow = await db('workouts').where({ student_id: student.id, status: 'published' }).count({ count: '*' }).first();
      const completedRow = await db('workout_sessions').where({ student_id: student.id, status: 'completed' }).whereBetween('completed_at', [range.start, range.end]).count({ count: '*' }).first();
      const last = await db('workout_sessions').where({ student_id: student.id, status: 'completed' }).whereNotNull('completed_at').orderBy('completed_at', 'desc').first('completed_at');
      const planned = Number(plannedRow?.count || 0);
      const completed = Number(completedRow?.count || 0);
      result.push({ studentId: student.id, planned, completed, adherence: planned ? Math.min(100, Math.round((completed / planned) * 100)) : 0, lastCompletedAt: last?.completed_at || null });
    }
    result.sort((a, b) => a.adherence - b.adherence || String(a.lastCompletedAt || '').localeCompare(String(b.lastCompletedAt || '')));
    return res.json({ from: range.start, to: range.end, students: result });
  } catch (error) {
    console.error('Get adherence error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { getAdherence };
