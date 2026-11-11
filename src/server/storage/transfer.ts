import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { z } from 'zod';
import { db, type Db } from '../db';
import { AppError, type Actor } from '../core';
import { getActor, assertSameOrigin } from '../auth';
import { entryAccess } from '../access';
import { objectStore, type ObjectStore } from './provider';
import { FileSystemStore } from './filesystem';
import { verifyStorageUploadToken, type StorageUploadClaims } from './tokens';
import { downloadFile, verifyDownloadGrant } from './downloads';

async function uploadAllowed(database: Db, actor: Actor | null, claims: StorageUploadClaims) {
  const [namespace, parentId, fileId] = claims.key.split('/');
  if (namespace !== 'submissions') throw new AppError(403, 'This upload authorization does not permit archive changes.');
  const { rows: [file] } = await database.query('SELECT * FROM portal_form_files WHERE id=$1', [fileId]);
  let asset = file;
  if (file) {
    const { rows: [record] } = await database.query('SELECT owner_id,draft_token_hash,status FROM portal_form_records WHERE id=$1', [file.record_id]);
    if (!record || file.record_id !== parentId || (record.owner_id && actor?.id !== record.owner_id) ||
      (!record.owner_id && !record.draft_token_hash)) throw new AppError(404, 'Editable upload not found.');
    if (record.owner_id) {
      const { rows } = await database.query('SELECT id FROM users WHERE id=$1 AND active', [record.owner_id]);
      if (!rows.length) throw new AppError(401, 'Your account is unavailable.');
    }
    if (record.status !== 'draft' || file.status !== 'pending') throw new AppError(409, 'This draft no longer accepts file parts.');
  } else {
    const { rows: [saved] } = await database.query('SELECT * FROM assets WHERE id=$1', [fileId]);
    if (!saved || !actor || saved.uploader_id !== actor.id || saved.submission_id !== parentId) throw new AppError(404, 'Editable upload not found.');
    const entry = await entryAccess(database, actor, saved.submission_id, true);
    if (entry.state !== 'draft' || entry.trashed_at || entry.purging || saved.trashed_at || saved.status !== 'uploading' || saved.revision !== entry.revision + 1) throw new AppError(409, 'This draft no longer accepts file parts.');
    asset = saved;
  }
  const size = Number(asset.expected_size), partSize = Number(asset.part_size);
  const expected = Math.min(partSize, size - (claims.partNumber - 1) * partSize);
  if (asset.storage_key !== claims.key || asset.upload_id !== claims.uploadId || expected <= 0 || expected !== claims.contentLength) throw new AppError(403, 'This authorization does not match the declared upload.');
}

export async function privateStorageAction(request: Request, database: Db = db, configuredStore?: ObjectStore, actorResolver = getActor) {
  try {
    const store = configuredStore ?? objectStore();
    const token = new URL(request.url).searchParams.get('token') || '';
    if (request.method === 'PUT') {
      assertSameOrigin(request);
      if (!(store instanceof FileSystemStore)) throw new AppError(404, 'Private upload gateway is unavailable.');
      const claims = verifyStorageUploadToken(process.env.AUTH_SECRET || '', token);
      const actor = await actorResolver(request);
      await uploadAllowed(database, actor, claims);
      const length = request.headers.get('content-length');
      if (length !== null && (!/^[1-9][0-9]*$/.test(length) || !Number.isSafeInteger(Number(length)))) throw new AppError(400, 'Invalid upload byte length.');
      if (!request.body) throw new AppError(400, 'Send the declared file part.');
      const body = Readable.fromWeb(request.body as unknown as NodeReadableStream);
      const result = await store.receivePart(claims, body, length === null ? undefined : Number(length));
      return new Response(null, { status: 200, headers: { ETag: result.ETag, 'Cache-Control': 'no-store' } });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') throw new AppError(405, 'Use a signed file transfer URL.');
    const grant = verifyDownloadGrant(token);
    const actor = grant.actorId ? await actorResolver(request) : null;
    return await downloadFile(request, database, store, grant, actor);
  } catch (error) {
    const status = error instanceof AppError ? error.status : error instanceof z.ZodError ? 400 : 503;
    return Response.json({ error: error instanceof AppError ? error.message : 'The private file transfer could not be completed.' },
      { status, headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
  }
}
