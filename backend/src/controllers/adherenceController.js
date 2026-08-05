const db = require('../database');
const { calculateAdherence, periodFromQuery, sortAdherence } = require('../services/adherenceService');

async function getAdherence(req, res) {
  let period;
  try { period = periodFromQuery(req.query); } catch (error) { return res.status(400).json({ error: error.message }); }
  try {
    const students = req.user.role === 'student'
      ? await db('student_profiles').select('student_id as id', 'weekly_workout_goal').where({ student_id: req.user.id })
      : req.user.role === 'personal'
        ? await db('student_profiles').select('student_id as id', 'weekly_workout_goal').where({ personal_id: req.user.id })
        : [];
    if (req.user.role !== 'student' && req.user.role !== 'personal') return res.status(403).json({ error: 'Adherence access forbidden' });
    const result = [];
    for (const student of students) {
      const completedRow = await db('workout_sessions').where({ student_id: student.id, status: 'completed' }).whereBetween('completed_at', [period.start.toISOString(), new Date(period.end.getTime() + 86399999).toISOString()]).count({ count: '*' }).first();
      const last = await db('workout_sessions').where({ student_id: student.id, status: 'completed' }).whereNotNull('completed_at').orderBy('completed_at', 'desc').first('completed_at');
      const completed = Number(completedRow?.count || 0);
      result.push({ studentId: student.id, weeklyGoal: student.weekly_workout_goal, ...calculateAdherence({ plannedWorkouts: student.weekly_workout_goal, completedSessions: completed, weeks: period.weeks }), lastWorkoutAt: last?.completed_at || null });
    }
    return res.json({ from: period.start.toISOString(), to: period.end.toISOString(), weeks: period.weeks, students: sortAdherence(result) });
  } catch (error) {
    console.error('Get adherence error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { getAdherence };
