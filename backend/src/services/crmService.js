const db = require('../database');

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

function inactivityDays(lastActivity, now) {
  const start = new Date(lastActivity);
  if (Number.isNaN(start.getTime())) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.floor((now.getTime() - start.getTime()) / 86400000));
}

async function lastStudentActivity(database, studentId, fallback) {
  const latest = await database('workout_sessions')
    .where({ student_id: studentId })
    .select(database.raw('COALESCE(completed_at, started_at) as last_activity_at'))
    .orderByRaw('COALESCE(completed_at, started_at) DESC')
    .first();
  return latest?.last_activity_at || fallback;
}

async function activeStudents(database, personalId) {
  const query = database('users as u')
    .join('student_profiles as sp', 'sp.student_id', 'u.id')
    .select('u.id as studentId', 'u.created_at as createdAt', 'sp.personal_id as personalId')
    .where('u.role', 'student')
    .where('u.account_status', 'active')
    .where('sp.relationship_status', 'active');
  if (personalId) query.where('sp.personal_id', personalId);
  return query;
}

async function generateChurnAlerts(database = db, { personalId = null, thresholdDays = 5, now = new Date(), actorUserId = personalId } = {}) {
  const students = await activeStudents(database, personalId);
  const detectedOn = dayKey(now);
  const generated = [];
  for (const student of students) {
    const lastActivity = await lastStudentActivity(database, student.studentId, student.createdAt);
    const days = inactivityDays(lastActivity, now);
    if (days < thresholdDays) continue;
    const existing = await database('crm_alerts').where({ personal_id: student.personalId, student_id: student.studentId, alert_type: 'churn', detected_on: detectedOn }).first();
    if (existing) {
      generated.push({ ...existing, duplicate: true });
      continue;
    }
    const [id] = await database('crm_alerts').insert({ personal_id: student.personalId, student_id: student.studentId, alert_type: 'churn', inactivity_days: days, status: 'open', detected_on: detectedOn });
    generated.push({ id, personalId: student.personalId, studentId: student.studentId, alertType: 'churn', inactivityDays: days, status: 'open' });
  }
  return generated;
}

async function issueNpsSurveys(database = db, { personalId = null, now = new Date() } = {}) {
  const students = await activeStudents(database, personalId);
  const issued = [];
  for (const student of students) {
    const pending = await database('nps_surveys').where({ personal_id: student.personalId, student_id: student.studentId, status: 'pending' }).first();
    if (pending) continue;
    const [id] = await database('nps_surveys').insert({ personal_id: student.personalId, student_id: student.studentId, status: 'pending', sent_at: now.toISOString() });
    issued.push({ id, personalId: student.personalId, studentId: student.studentId, status: 'pending' });
  }
  return issued;
}

async function runDailyCrm(database = db, options = {}) {
  const alerts = await generateChurnAlerts(database, options);
  const surveys = await issueNpsSurveys(database, options);
  return { alerts, surveys };
}

module.exports = { generateChurnAlerts, issueNpsSurveys, runDailyCrm };
