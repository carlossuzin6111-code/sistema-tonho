const fs = require('fs');
const os = require('os');
const path = require('path');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { HEADER, RETENTION, encryptBuffer, encryptionKey, retentionClass, uploadOffsiteBackup } = require('../services/offsiteBackupService');

describe('off-site backup encryption and retention', () => {
  test('requires a 32-byte key and encrypts with an authenticated envelope', () => {
    expect(() => encryptionKey('bad')).toThrow(/32-byte/);
    const key = Buffer.alloc(32, 7);
    const encrypted = encryptBuffer(Buffer.from('backup'), key);
    expect(encrypted.subarray(0, HEADER.length)).toEqual(HEADER);
    expect(encrypted).not.toContain('backup');
  });

  test('calculates daily, weekly and monthly retention classes', () => {
    expect(retentionClass(new Date('2026-07-29T12:00:00Z'))).toEqual({ daily: '2026-07-29', weekly: '2026-07-W5', monthly: '2026-07' });
    expect(RETENTION).toEqual({ daily: 7, weekly: 4, monthly: 1 });
  });

  test('uploads only encrypted database plus manifest through the injected S3 client', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fitlife-offsite-'));
    fs.writeFileSync(path.join(directory, 'database.sqlite'), 'private db');
    fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({ formatVersion: 1, database: { file: 'database.sqlite' } }));
    const calls = [];
    const client = { send: async command => { calls.push(command); return {}; } };
    const result = await uploadOffsiteBackup(directory, {
      now: new Date('2026-07-29T12:00:00Z'),
      client,
      prune: false,
      config: { bucket: 'test-bucket', prefix: 'fitlife/backups', key: Buffer.alloc(32, 3) }
    });
    expect(result.uploaded).toBe(true);
    expect(calls).toHaveLength(6);
    expect(calls[0]).toBeInstanceOf(PutObjectCommand);
    expect(calls[0].input.Key).toMatch(/daily\/2026-07-29/);
    expect(calls[0].input.Body.toString()).not.toContain('private db');
    expect(JSON.parse(calls[1].input.Body).encryption.algorithm).toBe('AES-256-GCM');
    expect(calls[2].input.Key).toMatch(/weekly\/2026-07-W5/);
    expect(calls[4].input.Key).toMatch(/monthly\/2026-07/);
  });
});
