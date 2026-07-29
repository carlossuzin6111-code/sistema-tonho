const {
  EXERCISE_MEDIA_QUOTA_BYTES,
  embeddedImageBytes,
  hasMediaQuota
} = require('../services/mediaQuotaService');

test('counts only embedded image payloads against the catalog media quota', () => {
  expect(embeddedImageBytes('https://raw.githubusercontent.com/example/exercise.gif')).toBe(0);
  expect(embeddedImageBytes('data:image/png;base64,AAAA')).toBeGreaterThan(0);
  expect(hasMediaQuota(EXERCISE_MEDIA_QUOTA_BYTES - 1, 1)).toBe(true);
  expect(hasMediaQuota(EXERCISE_MEDIA_QUOTA_BYTES, 1)).toBe(false);
});
