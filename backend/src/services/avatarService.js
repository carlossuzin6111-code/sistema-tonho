const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');

const AVATAR_DIR = process.env.AVATAR_DIR || path.join(process.cwd(), 'data', 'avatars');
const MAX_INPUT_BYTES = 400000;
const MAX_INPUT_DIMENSION = 4096;
const OUTPUT_SIZE = 512;
const DATA_URL_PATTERN = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/]+={0,2})$/i;

class AvatarError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function decodeAvatarDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string' || dataUrl.length > 540000) throw new AvatarError('INVALID_AVATAR');
  const match = dataUrl.match(DATA_URL_PATTERN);
  if (!match || match[2].length % 4 !== 0) throw new AvatarError('INVALID_AVATAR');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > MAX_INPUT_BYTES) throw new AvatarError('AVATAR_TOO_LARGE');
  const declaredType = match[1].toLowerCase();
  const signatureMatches = declaredType === 'png'
    ? bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    : declaredType === 'webp'
      ? bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
      : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!signatureMatches) throw new AvatarError('INVALID_AVATAR');
  return bytes;
}

async function writeAvatar(userId, dataUrl) {
  const bytes = decodeAvatarDataUrl(dataUrl);
  let image;
  try {
    image = sharp(bytes, { failOn: 'warning', limitInputPixels: MAX_INPUT_DIMENSION ** 2 });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format)
      || !metadata.width || !metadata.height
      || metadata.width > MAX_INPUT_DIMENSION || metadata.height > MAX_INPUT_DIMENSION
      || (metadata.pages || 1) !== 1) {
      throw new AvatarError('INVALID_AVATAR');
    }
  } catch (error) {
    if (error instanceof AvatarError) throw error;
    throw new AvatarError('INVALID_AVATAR');
  }

  await fs.mkdir(AVATAR_DIR, { recursive: true });
  const filename = `${userId}-${crypto.randomUUID()}.webp`;
  const finalPath = path.join(AVATAR_DIR, filename);
  const temporaryPath = `${finalPath}.tmp`;
  try {
    await image.rotate().resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: 'cover', position: 'centre' })
      .webp({ quality: 82 })
      .toFile(temporaryPath);
    await fs.rename(temporaryPath, finalPath);
    return filename;
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    throw new AvatarError('INVALID_AVATAR');
  }
}

function resolveAvatarPath(filename) {
  if (typeof filename !== 'string' || !/^\d+-[0-9a-f-]+\.webp$/i.test(filename)) return null;
  const resolved = path.resolve(AVATAR_DIR, filename);
  return resolved.startsWith(`${path.resolve(AVATAR_DIR)}${path.sep}`) ? resolved : null;
}

async function removeAvatar(filename) {
  const avatarPath = resolveAvatarPath(filename);
  if (avatarPath) await fs.rm(avatarPath, { force: true });
}

module.exports = {
  AvatarError,
  MAX_INPUT_BYTES,
  decodeAvatarDataUrl,
  removeAvatar,
  resolveAvatarPath,
  writeAvatar
};
