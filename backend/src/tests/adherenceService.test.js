const { calculateAdherence, periodFromQuery, sortAdherence } = require('../services/adherenceService');

describe('weekly adherence analytics', () => {
  test('calculates completed divided by planned workouts across weeks', () => {
    expect(calculateAdherence({ plannedWorkouts: 2, completedSessions: 3, weeks: 4 })).toEqual({ planned: 8, completed: 3, adherence: 37.5 });
    expect(calculateAdherence({ plannedWorkouts: 0, completedSessions: 0, weeks: 4 }).adherence).toBeNull();
  });

  test('validates date range and computes inclusive week count', () => {
    expect(periodFromQuery({ from: '2026-07-01', to: '2026-07-14' }).weeks).toBe(2);
    expect(() => periodFromQuery({ from: '2026-07-15', to: '2026-07-01' })).toThrow(/before/);
    expect(() => periodFromQuery({ from: 'not-a-date' })).toThrow(/YYYY-MM-DD/);
  });

  test('sorts lowest adherence first and then oldest workout', () => {
    const rows = sortAdherence([
      { studentId: 1, adherence: 50, lastWorkoutAt: '2026-07-10T00:00:00Z' },
      { studentId: 2, adherence: 20, lastWorkoutAt: '2026-07-12T00:00:00Z' },
      { studentId: 3, adherence: 50, lastWorkoutAt: '2026-07-01T00:00:00Z' }
    ]);
    expect(rows.map(row => row.studentId)).toEqual([2, 3, 1]);
  });
});
