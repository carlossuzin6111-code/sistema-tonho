const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand
} = require('@aws-sdk/client-s3');

const HEADER = Buffer.from('FITLIFE-BACKUP-V1');
const RETENTION = Object.freeze({ daily: 7, weekly: 4, monthly: 1 });

function encryptionKey(value = process.env.BACKUP_ENCRYPTION_KEY) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error('BACKUP_ENCRYPTION_KEY must be a 32-byte hexadecimal key');
  }
  return Buffer.from(value, 'hex');
}

function encryptBuffer(buffer, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return Buffer.concat([HEADER, iv, encrypted, cipher.getAuthTag()]);
}

function retentionClass(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const firstDay = new Date(Date.UTC(year, date.getUTCMonth(), 1));
  const week = Math.ceil((date.getUTCDate() + firstDay.getUTCDay()) / 7);
  return { daily: `${year}-${month}-${day}`, weekly: `${year}-${month}-W${week}`, monthly: `${year}-${month}` };
}

function clientFromEnv() {
  return new S3Client({
    region: process.env.BACKUP_S3_REGION || 'auto',
    endpoint: process.env.BACKUP_S3_ENDPOINT || undefined,
    forcePathStyle: process.env.BACKUP_S3_FORCE_PATH_STYLE === 'true',
    credentials: process.env.BACKUP_S3_ACCESS_KEY_ID
      ? { accessKeyId: process.env.BACKUP_S3_ACCESS_KEY_ID, secretAccessKey: process.env.BACKUP_S3_SECRET_ACCESS_KEY }
      : undefined
  });
}

function remoteConfig() {
  if (!process.env.BACKUP_S3_BUCKET) return null;
  return {
    bucket: process.env.BACKUP_S3_BUCKET,
    prefix: (process.env.BACKUP_S3_PREFIX || 'fitlife/backups').replace(/^\/|\/$/g, ''),
    key: encryptionKey()
  };
}

async function pruneRemote(client, config) {
  const objects = await client.send(new ListObjectsV2Command({ Bucket: config.bucket, Prefix: `${config.prefix}/` }));
  const grouped = { daily: [], weekly: [], monthly: [] };
  for (const object of objects.Contents || []) {
    const match = object.Key?.match(new RegExp(`^${config.prefix}/(daily|weekly|monthly)/`));
    if (match) grouped[match[1]].push(object);
  }
  const deletions = Object.entries(grouped).flatMap(([kind, values]) => values
    .sort((a, b) => String(b.LastModified || '').localeCompare(String(a.LastModified || '')))
    .slice(RETENTION[kind])
    .map(object => ({ Key: object.Key })));
  if (deletions.length) await client.send(new DeleteObjectsCommand({ Bucket: config.bucket, Delete: { Objects: deletions, Quiet: true } }));
  return { deleted: deletions.length };
}

async function uploadOffsiteBackup(backupDirectory, options = {}) {
  const config = options.config || remoteConfig();
  if (!config) return { uploaded: false, reason: 'not_configured' };
  const client = options.client || clientFromEnv();
  const now = options.now || new Date();
  const name = path.basename(backupDirectory);
  const classes = retentionClass(now);
  const bases = Object.entries(classes).map(([kind, value]) => `${config.prefix}/${kind}/${value}/${name}`);
  const encryptedDatabase = encryptBuffer(fs.readFileSync(path.join(backupDirectory, 'database.sqlite')), config.key);
  const manifest = JSON.parse(fs.readFileSync(path.join(backupDirectory, 'manifest.json'), 'utf8'));
  const metadata = { ...manifest, encryption: { algorithm: 'AES-256-GCM', format: HEADER.toString(), keyVersion: process.env.BACKUP_ENCRYPTION_KEY_VERSION || '1' } };
  for (const base of bases) {
    await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: `${base}/database.sqlite.enc`, Body: encryptedDatabase, ContentType: 'application/octet-stream', ServerSideEncryption: 'AES256' }));
    await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: `${base}/manifest.json`, Body: JSON.stringify(metadata), ContentType: 'application/json', ServerSideEncryption: 'AES256' }));
  }
  const pruning = options.prune === false ? { deleted: 0 } : await pruneRemote(client, config);
  return { uploaded: true, bucket: config.bucket, prefixes: bases, classes, ...pruning };
}

module.exports = { HEADER, RETENTION, encryptBuffer, encryptionKey, retentionClass, remoteConfig, uploadOffsiteBackup, pruneRemote };
