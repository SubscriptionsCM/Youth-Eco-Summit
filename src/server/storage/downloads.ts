import { createHmac, timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { z } from 'zod';
import { AppError, type Actor } from '../core';
import type { Db } from '../db';
import { getFormRecord } from '../portal-forms';
import { historicalAttachment } from '../wordpress-projection';
import { FileSystemStore } from './filesystem';
import { S3Store, type ObjectStore } from './provider';
import { parseRange, safeDisposition } from './validation';

const grantSchema = z.object({
  version: z.literal(1), purpose: z.literal('download'), kind: z.enum(['portal', 'history']),
  fileId: z.uuid(), actorId: z.uuid().optional(), draftFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  issuedAt: z.number().int().nonnegative(), expiresAt: z.number().int().nonnegative(),
}).strict().refine(value => value.kind === 'history' ? !!value.actorId && !value.draftFingerprint : !!value.actorId !== !!value.draftFingerprint);
export type StorageDownloadGrant = z.infer<typeof grantSchema>;
export type PortalFile = { id: string; record_id: string; status: string; storage_key: string; filename: string; mime_type: string; expected_size: number | string; expected_checksum: string; metadata?: Record<string, unknown> };
type DownloadFile = { key: string; filename: string; mime: string; size: number; checksum: string; version?: string; etag?: string };

function secret() {
  const value = process.env.AUTH_SECRET || '';
  if (Buffer.byteLength(value) < 32) throw new AppError(503, 'Private downloads are not configured.');
  return value;
}

function mac(value: string) {
  const key = createHmac('sha256', secret()).update('yes-private-storage:download:v1').digest();
  return createHmac('sha256', key).update(value).digest();
}

function draftFingerprint(recordId: string, hash: string) {
  return mac(`draft:${recordId}:${hash}`).toString('hex');
}

function signedUrl(input: Omit<StorageDownloadGrant, 'version' | 'purpose' | 'issuedAt' | 'expiresAt'>) {
  const now = Math.floor(Date.now() / 1000);
  const grant = grantSchema.parse({ ...input, version: 1, purpose: 'download', issuedAt: now, expiresAt: now + 60 });
  const payload = Buffer.from(JSON.stringify(grant)).toString('base64url');
  const origin = new URL(process.env.APP_ORIGIN || '');
  if (origin.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) throw new AppError(503, 'Private downloads require HTTPS.');
  const url = new URL('/api/private-storage', origin.origin);
  url.searchParams.set('token', `${payload}.${mac(payload).toString('base64url')}`);
  return url.toString();
}

export function verifyDownloadGrant(token: string, now = Math.floor(Date.now() / 1000)): StorageDownloadGrant {
  try {
    if (token.length > 2048 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Invalid token');
    const [payload, signature] = token.split('.');
    const actual = Buffer.from(signature, 'base64url'), expected = mac(payload);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Invalid signature');
    const grant = grantSchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
    if (!Number.isSafeInteger(now) || grant.issuedAt > now || grant.expiresAt <= now || grant.expiresAt <= grant.issuedAt || grant.expiresAt - grant.issuedAt > 60) throw new Error('Expired token');
    return grant;
  } catch {
    throw new AppError(403, 'This private download authorization is invalid or expired.');
  }
}

async function s3Download(store: ObjectStore, file: DownloadFile) {
  if (!(store instanceof S3Store)) throw new AppError(503, 'The private download provider is unavailable.');
  return getSignedUrl(store.client, new GetObjectCommand({ Bucket: store.bucket, Key: file.key,
    VersionId: file.version, IfMatch: file.etag, ResponseContentDisposition: safeDisposition(file.mime, file.filename, true), ResponseContentType: file.mime }), { expiresIn: 60 });
}

function portalFile(file: PortalFile): DownloadFile {
  return { key: file.storage_key, filename: file.filename, mime: file.mime_type,
    size: Number(file.expected_size), checksum: file.expected_checksum,
    version: typeof file.metadata?.storageVersion === 'string' ? file.metadata.storageVersion : undefined,
    etag: typeof file.metadata?.storageEtag === 'string' ? file.metadata.storageEtag : undefined };
}

export async function portalDownloadUrl(database: Db, store: ObjectStore, actor: Actor | null, file: PortalFile, token?: string) {
  const record = await getFormRecord(database, actor, file.record_id, token);
  if (file.status !== 'ready' || !(record.files as PortalFile[]).some(item => item.id === file.id && item.status === 'ready')) throw new AppError(409, 'File verification is still pending.');
  if (!(store instanceof FileSystemStore)) return s3Download(store, portalFile(file));
  if (actor && (actor.id === record.owner_id || (record.status === 'submitted' && ['owner','admin'].includes(actor.role)))) return signedUrl({ kind: 'portal', fileId: file.id, actorId: actor.id });
  const { rows: [saved] } = await database.query('SELECT owner_id,draft_token_hash FROM portal_form_records WHERE id=$1', [file.record_id]);
  if (!saved || saved.owner_id || !saved.draft_token_hash) throw new AppError(404, 'Private file not found.');
  return signedUrl({ kind: 'portal', fileId: file.id, draftFingerprint: draftFingerprint(file.record_id, saved.draft_token_hash) });
}

export async function historicalDownloadUrl(database: Db, store: ObjectStore, actor: Actor, attachmentId: string) {
  const file = await historicalAttachment(database, actor, attachmentId);
  if (!(store instanceof FileSystemStore)) return s3Download(store, { key: file.storage_key, filename: file.filename,
    mime: file.mime_type, size: file.byte_size, checksum: file.checksum });
  return signedUrl({ kind: 'history', fileId: attachmentId, actorId: actor.id });
}

export async function downloadFile(request: Request, database: Db, store: ObjectStore, grant: StorageDownloadGrant, actor: Actor | null) {
  let file: DownloadFile;
  if (grant.kind === 'history') {
    if (!actor || actor.id !== grant.actorId) throw new AppError(404, 'Private file not found.');
    const saved = await historicalAttachment(database, actor, grant.fileId);
    file = { key: saved.storage_key, filename: saved.filename, mime: saved.mime_type, size: saved.byte_size, checksum: saved.checksum };
  } else {
    const { rows: [saved] } = await database.query<PortalFile>('SELECT * FROM portal_form_files WHERE id=$1', [grant.fileId]);
    if (!saved || saved.status !== 'ready') throw new AppError(404, 'Private file not found.');
    if (grant.actorId) {
      if (!actor || actor.id !== grant.actorId) throw new AppError(404, 'Private file not found.');
      await getFormRecord(database, actor, saved.record_id);
    } else {
      const { rows: [record] } = await database.query('SELECT owner_id,draft_token_hash FROM portal_form_records WHERE id=$1', [saved.record_id]);
      if (!record || record.owner_id || !record.draft_token_hash || draftFingerprint(saved.record_id, record.draft_token_hash) !== grant.draftFingerprint) throw new AppError(404, 'Private file not found.');
    }
    file = portalFile(saved);
  }
  const identity = await store.head(file.key, file.version);
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || identity.ContentLength !== file.size ||
    (store instanceof FileSystemStore && identity.VersionId !== file.checksum)) throw new AppError(409, 'The retained file does not match its verified record.');
  const headers = new Headers({ 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox", 'Referrer-Policy': 'no-referrer', Vary: 'Cookie',
    'Content-Type': /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(file.mime) ? file.mime : 'application/octet-stream',
    'Content-Disposition': safeDisposition(file.mime, file.filename, true), 'Accept-Ranges': 'bytes' });
  let range: { start: number; end: number } | undefined;
  if (request.headers.has('range')) {
    try { range = parseRange(request.headers.get('range')!, file.size); }
    catch { headers.set('Content-Range', `bytes */${file.size}`); return new Response(null, { status: 416, headers }); }
  }
  headers.set('Content-Length', String(range ? range.end - range.start + 1 : file.size));
  if (identity.ETag) headers.set('ETag', identity.ETag);
  if (range) headers.set('Content-Range', `bytes ${range.start}-${range.end}/${file.size}`);
  const status = range ? 206 : 200;
  if (request.method === 'HEAD') return new Response(null, { status, headers });
  const result = await store.read(file.key, file.version ?? identity.VersionId, file.etag ?? identity.ETag,
    range ? `bytes=${range.start}-${range.end}` : undefined);
  if (!result.Body) throw new AppError(503, 'The retained file could not be read.');
  return new Response(Readable.toWeb(Readable.from(result.Body)) as ReadableStream<Uint8Array>, { status, headers });
}
