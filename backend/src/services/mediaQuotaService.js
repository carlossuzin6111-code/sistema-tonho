const DEFAULT_EXERCISE_MEDIA_QUOTA_BYTES = 20 * 1024 * 1024;
const EXERCISE_MEDIA_QUOTA_BYTES = Number(process.env.EXERCISE_MEDIA_QUOTA_BYTES) > 0
  ? Number(process.env.EXERCISE_MEDIA_QUOTA_BYTES)
  : DEFAULT_EXERCISE_MEDIA_QUOTA_BYTES;

function embeddedImageBytes(value) {
  return typeof value === 'string' && value.startsWith('data:') ? Buffer.byteLength(value, 'utf8') : 0;
}

function hasMediaQuota(usedBytes, additionalBytes = 0) {
  return Number(usedBytes || 0) + Number(additionalBytes || 0) <= EXERCISE_MEDIA_QUOTA_BYTES;
}

module.exports = { DEFAULT_EXERCISE_MEDIA_QUOTA_BYTES, EXERCISE_MEDIA_QUOTA_BYTES, embeddedImageBytes, hasMediaQuota };
