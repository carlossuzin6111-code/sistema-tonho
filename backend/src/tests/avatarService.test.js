const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');

const avatarDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'fitlife-avatar-hardening-'));
process.env.AVATAR_DIR = avatarDirectory;
const sharp = require('sharp');
const {
  cleanupUserAvatars,
  getUserAvatarFiles,
  getUserAvatarUsage,
  writeAvatar
} = require('../services/avatarService');

afterAll(async () => {
  await fsp.rm(avatarDirectory, { recursive: true, force: true });
});

async function imageDataUrl() {
  const bytes = await sharp({ create: { width: 32, height: 32, channels: 4, background: { r: 20, g: 120, b: 220, alpha: 1 } } })
    .png().toBuffer();
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

test('normalizes uploads and reconciles orphaned files per user', async () => {
  const dataUrl = await imageDataUrl();
  const first = await writeAvatar(42, dataUrl);
  const second = await writeAvatar(42, dataUrl);
  expect(first).not.toBe(second);
  expect(await getUserAvatarFiles(42)).toHaveLength(2);
  expect(await getUserAvatarUsage(42)).toBeGreaterThan(0);

  const removed = await cleanupUserAvatars(42, second);
  expect(removed).toBe(1);
  expect(await getUserAvatarFiles(42)).toEqual([second]);
  expect(fs.existsSync(path.join(avatarDirectory, first))).toBe(false);
});
