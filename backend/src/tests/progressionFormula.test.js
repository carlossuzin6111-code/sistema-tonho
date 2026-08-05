const { estimateEpleyOneRepMax } = require('../controllers/progressionController');

describe('Epley one-repetition maximum estimate', () => {
  test('calculates a documented estimate for valid weight and repetitions', () => {
    expect(estimateEpleyOneRepMax(100, 10)).toBe(133.33);
    expect(estimateEpleyOneRepMax(80, 1)).toBe(82.67);
  });

  test('does not estimate invalid or high-repetition sets', () => {
    expect(estimateEpleyOneRepMax(0, 10)).toBeNull();
    expect(estimateEpleyOneRepMax(100, 31)).toBeNull();
  });
});
