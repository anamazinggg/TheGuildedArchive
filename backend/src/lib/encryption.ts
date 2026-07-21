import crypto from 'node:crypto';

const VERSION = 'v1';
const secret = process.env.TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET || 'development-token-key-change-me';
const key = crypto.createHash('sha256').update(secret).digest();

export function encryptSecret(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptSecret(value: string): string {
  if (!value.startsWith(`${VERSION}.`)) {
    // Backward-compatible migration path for prototype records that used Base64.
    return Buffer.from(value, 'base64').toString('utf8');
  }

  const [, ivEncoded, tagEncoded, ciphertextEncoded] = value.split('.');
  if (!ivEncoded || !tagEncoded || !ciphertextEncoded) {
    throw new Error('Encrypted secret has an invalid format');
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivEncoded, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagEncoded, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextEncoded, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
