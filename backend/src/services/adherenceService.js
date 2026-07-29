const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Dates must use YYYY-MM-DD');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Invalid date');
  return date;
}

function periodFromQuery({ from, to, now = new Date() } = {}) {
  const endDefault = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startDefault = new Date(endDefault.getTime() - (28 * DAY_MS));
  const start = parseDate(from, startDefault);
  const end = parseDate(to, endDefault);
  if (start > end) throw new Error('from must be before or equal to to');
  const weeks = Math.max(1, Math.ceil((end.getTime() - start.getTime() + DAY_MS) / (7 * DAY_MS)));
  return { start, end, weeks };
}

function calculateAdherence({ plannedWorkouts = 0, completedSessions = 0, weeks = 1 } = {}) {
  const planned = Math.max(0, Number(plannedWorkouts) || 0) * Math.max(1, Number(weeks) || 1);
  const completed = Math.max(0, Number(completedSessions) || 0);
  const adherence = planned ? Math.min(100, Number(((completed / planned) * 100).toFixed(2))) : null;
  return { planned, completed, adherence };
}

function sortAdherence(rows) {
  return [...rows].sort((a, b) => (a.adherence ?? 101) - (b.adherence ?? 101)
    || (a.lastWorkoutAt ? (b.lastWorkoutAt ? new Date(a.lastWorkoutAt) - new Date(b.lastWorkoutAt) : -1) : 1));
}

module.exports = { calculateAdherence, parseDate, periodFromQuery, sortAdherence };
