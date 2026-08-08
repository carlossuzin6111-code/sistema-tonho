const db = require('../database');
const { enqueueNotification } = require('../services/notificationService');

const INTERVAL_MS = Math.max(60_000, Number(process.env.READINESS_REMINDER_INTERVAL_MS || 900_000));

async function runReadinessReminderCycle(dateKey = new Date().toISOString().slice(0, 10)) {
  const students = await db('users').where({ role: 'student', account_status: 'active' }).select('id');
  const checked = await db('readiness_checkins').where({ date_key: dateKey }).pluck('student_id');
  const done = new Set(checked);
  let reminded = 0;
  for (const student of students) {
    if (done.has(student.id)) continue;
    await enqueueNotification({ userId: student.id, eventType: 'system', title: 'Check-in de prontidão', body: 'Responda seu check-in diário antes de iniciar o treino.', dedupeKey: `readiness-reminder:${dateKey}` });
    reminded += 1;
  }
  return { dateKey, reminded };
}

async function run() {
  await db.ready;
  await runReadinessReminderCycle();
  setInterval(() => runReadinessReminderCycle().catch(error => console.error('[Readiness] reminder failed:', error.message)), INTERVAL_MS);
}

if (require.main === module) run().catch(error => { console.error('[Readiness] worker failed:', error); process.exitCode = 1; });

module.exports = { INTERVAL_MS, runReadinessReminderCycle };
