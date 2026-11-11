import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../core';

export const MAX_STORAGE_PART_BYTES = 8 * 1024 ** 2;
export const MAX_STORAGE_OBJECT_BYTES = 512 * 1024 ** 2;
export const STORAGE_UPLOAD_LIFETIME_SECONDS = 300;
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const keyPattern = new RegExp(`^(?:submissions/${uuid}/${uuid}|wordpress/[a-f0-9]{64}/[a-f0-9]{64})$`);
export const storageKeySchema = z.string().regex(keyPattern);
const uploadInputSchema = z.object({
  key: storageKeySchema,
  uploadId: z.uuid(),
  partNumber: z.number().int().min(1).max(10000),
  contentLength: z.number().int().min(1).max(MAX_STORAGE_PART_BYTES),
}).strict();
const uploadClaimsSchema = uploadInputSchema.extend({
  version: z.literal(1),
  purpose: z.literal('upload-part'),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
}).strict();
export type StorageUploadInput = z.infer<typeof uploadInputSchema>;
export type StorageUploadClaims = z.infer<typeof uploadClaimsSchema>;

function signingKey(secret: string) {
  if (Buffer.byteLength(secret) < 32) throw new AppError(503, 'Private storage requires a signing secret of at least 32 bytes.');
  return createHmac('sha256', secret).update('yes-private-storage:upload-part:v1').digest();
}

export function signStorageUploadToken(secret: string, input: StorageUploadInput, now = Math.floor(Date.now() / 1000)): string {
  const claims = uploadClaimsSchema.parse({ ...uploadInputSchema.parse(input), version: 1, purpose: 'upload-part', issuedAt: now, expiresAt: now + STORAGE_UPLOAD_LIFETIME_SECONDS });
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = createHmac('sha256', signingKey(secret)).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyStorageUploadToken(secret: string, token: string, now = Math.floor(Date.now() / 1000)): StorageUploadClaims {
  const key = signingKey(secret);
  try {
    if (token.length > 2048 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Invalid token');
    const [payload, encodedSignature] = token.split('.');
    const signature = Buffer.from(encodedSignature, 'base64url');
    const expected = createHmac('sha256', key).update(payload).digest();
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) throw new Error('Invalid signature');
    const claims = uploadClaimsSchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
    if (!Number.isSafeInteger(now) || claims.issuedAt > now || claims.expiresAt <= now || claims.expiresAt <= claims.issuedAt || claims.expiresAt - claims.issuedAt > STORAGE_UPLOAD_LIFETIME_SECONDS) throw new Error('Expired token');
    return claims;
  } catch {
    throw new AppError(403, 'This private upload authorization is invalid or expired.');
  }
}
