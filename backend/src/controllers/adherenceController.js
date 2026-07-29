const db = require('../database');
const { calculateAdherence, periodFromQuery, sortAdherence } = require('../services/adherenceService');

async function getAdherence(req, res) {
  let period;
  try {
    period = periodFromQuery(req.query);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  try {
    const students = await db('student_profiles as sp')
      .join('users as u', 'u.id', 'sp.student_id')
      .where('sp.personal_id', req.user.id)
      .select('sp.student_id as studentId', 'u.name', 'u.email');
    const plannedRows = await db('workouts').where({ personal_id: req.user.id, status: 'published' }).select('student_id').count('* as total').groupBy('student_id');
    const completedRows = await db('workout_sessions').where({ personal_id: req.user.id, status: 'completed' })
      .whereBetween('completed_at', [period.start.toISOString(), period.end.toISOString()])
      .select('student_id').count('* as total').max('completed_at as lastWorkoutAt').groupBy('student_id');
    const planned = new Map(plannedRows.map(row => [Number(row.student_id), Number(row.total)]));
    const completed = new Map(completedRows.map(row => [Number(row.student_id), row]));
    const rows = students.map(student => {
      const done = completed.get(Number(student.studentId));
      return {
        studentId: student.studentId,
        name: student.name,
        email: student.email,
        ...calculateAdherence({ plannedWorkouts: planned.get(Number(student.studentId)), completedSessions: done?.total, weeks: period.weeks }),
        lastWorkoutAt: done?.lastWorkoutAt || null
      };
    });
    return res.json({ from: period.start.toISOString().slice(0, 10), to: period.end.toISOString().slice(0, 10), weeks: period.weeks, students: sortAdherence(rows) });
  } catch (error) {
    console.error('Adherence report error:', error.message);
    return res.status(500).json({ error: 'Failed to calculate adherence' });
  }
}

module.exports = { getAdherence };
