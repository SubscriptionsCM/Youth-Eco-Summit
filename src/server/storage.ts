import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { db, type Db } from './db';
import { AppError, audit, ok, requireAdmin, type Actor } from './core';
import { assetAccess, entryAccess } from './access';
import { objectStore, isMissing } from './storage/provider';
import { anonymousFilename, ContentRejected, inspectContent, inspectFileMetadata, rulesForRole, validateFileSelection, parseRange, safeDisposition, type FileRules } from './storage/validation';
import { scanContent } from './storage/scanner';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Asset = { role?:string|null; metadata?:Record<string,unknown>; generated_name?:string|null; id: string; submission_id: string; revision: number; uploader_id: string; original_name: string; storage_key: string; mime_type: string; byte_size: number; checksum: string; expected_size: number; expected_checksum: string; status: string; upload_id: string; part_size: number; storage_version?: string; storage_etag?: string; trashed_at: string | null; error?: string };
const mediaAssetSchema = z.object({
  id:z.uuid(), original_name:z.string(), generated_name:z.string().nullish(), mime_type:z.string().min(1),
  byte_size:z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  storage_key:z.string().min(1), storage_version:z.string().nullish(), storage_etag:z.string().nullish(),
  status:z.literal('ready'), trashed_at:z.null(),
});

function rulesFor(config: { files?: FileRules }): FileRules {
  const f = config?.files;
  if (!f || !Number.isSafeInteger(f.maxBytes) || f.maxBytes < 1 || !Number.isInteger(f.maxCount) || f.maxCount < 1 || !Array.isArray(f.types) || !f.types.length) throw new AppError(409, 'Approved file requirements are not configured');
  return f;
}
function requireId(value: unknown): asserts value is string { if (typeof value !== 'string' || !UUID.test(value)) throw new AppError(400, 'Invalid reference'); }
function writable(entry: Record<string, any>, asset?: Asset) {
  if (entry.trashed_at || entry.purging || entry.state !== 'draft') throw new AppError(409, 'Uploads require an active editable draft');
  if (asset && (asset.trashed_at || asset.revision !== entry.revision + 1)) throw new AppError(409, 'This upload does not belong to the current draft revision');
}
async function ownedAsset(database: Db, actor: Actor, assetId: string, write: boolean, includeTrashed = false) {
  requireId(assetId);
  const found = await database.query<Asset>('SELECT * FROM assets WHERE id=$1', [assetId]);
  const asset = found.rows[0];
  if (!asset || asset.uploader_id !== actor.id || (asset.trashed_at && !includeTrashed)) throw new AppError(404, 'Upload not found');
  const entry = await entryAccess(database, actor, asset.submission_id, write);
  if (entry.trashed_at || entry.purging) throw new AppError(404, 'Upload not found');
  if (write) writable(entry, includeTrashed ? { ...asset, trashed_at: null } : asset);
  return { asset, entry };
}
function summary(asset: Asset) { return { id: asset.id, status: asset.status, partSize: Number(asset.part_size), partCount: Math.ceil(Number(asset.expected_size) / Number(asset.part_size)), error: asset.error ?? undefined }; }
async function queueVerification(database: Db, assetId: string) {
  await database.query(`INSERT INTO jobs(id,kind,payload,status,run_after) SELECT $1,'verify_asset',$2::jsonb,'pending',now() WHERE NOT EXISTS (SELECT 1 FROM jobs WHERE kind='verify_asset' AND payload->>'assetId'=$3 AND status IN ('pending','running'))`, [randomUUID(), JSON.stringify({ assetId }), assetId]);
}

export async function storageAction(request: Request, actor: Actor, path: string[]): Promise<Response | null> {
  if (path[0] === 'media' && path.length === 2 && ['GET', 'HEAD'].includes(request.method)) return media(request, actor, path[1]);
  if (path[0] !== 'uploads') return null;
  if (path[1] === 'start' && path.length === 2 && request.method === 'POST') {
    const input = await request.json();
    requireId(input.submissionId);
    if (typeof input.originalName !== 'string' || !input.originalName.trim() || input.originalName.length > 240 || /[\u0000-\u001F\u007F]/.test(input.originalName)) throw new AppError(400, 'A valid original filename is required');
    if (!Number.isSafeInteger(input.byteSize) || input.byteSize <= 0 || typeof input.checksum !== 'string' || !/^[a-f0-9]{64}$/i.test(input.checksum)) throw new AppError(400, 'File size and full SHA256 checksum are required');
    const store = objectStore();
    return db.transaction(async tx => {
      await tx.query('SELECT id FROM submissions WHERE id=$1 FOR UPDATE', [input.submissionId]);
      const entry = await entryAccess(tx, actor, input.submissionId, true); writable(entry);
      const files = rulesFor(entry.config), rules = rulesForRole(files,input.role);
      if (input.byteSize > rules.maxBytes || input.byteSize > 5 * 1024 ** 4) throw new AppError(400, 'File exceeds the configured size limit');
      const {rows:existing} = await tx.query(`SELECT role,expected_size,byte_size FROM assets WHERE submission_id=$1 AND revision=$2 AND trashed_at IS NULL AND status <> 'quarantined'`, [entry.id, entry.revision + 1]);
      validateFileSelection(files,[...existing,{role:input.role??null,expected_size:input.byteSize}],false);
      const id = randomUUID(), key = `submissions/${entry.id}/${id}`;
      const partSize = Math.max(8 * 1024 ** 2, Math.ceil(input.byteSize / 10000 / (1024 ** 2)) * 1024 ** 2);
      const uploadId = await store.begin(key, { expectedSize: input.byteSize, checksum: input.checksum.toLowerCase(), partSize });
      const result = await tx.query<Asset>(`INSERT INTO assets(id,submission_id,revision,uploader_id,original_name,storage_key,expected_size,expected_checksum,part_size,upload_id,role) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, [id, entry.id, entry.revision + 1, actor.id, input.originalName, key, input.byteSize, input.checksum.toLowerCase(), partSize, uploadId,input.role??null]);
      await audit(tx, actor, 'upload.started', 'asset', id, { submissionId: entry.id, byteSize: input.byteSize });
      return ok(summary(result.rows[0]), 201);
    });
  }
  if (path.length < 2) return null;
  const assetId = path[1];
  if (path.length === 3 && path[2] === 'recover' && request.method === 'POST') {
    requireAdmin(actor); requireId(assetId);
    const input = z.object({ reason: z.string().trim().min(3).max(2000) }).parse(await request.json());
    return db.transaction(async tx => {
      // Match submission/Trash serialization; this never edits the submitted snapshot.
      await tx.query('SELECT s.id FROM submissions s JOIN assets a ON a.submission_id=s.id WHERE a.id=$1 FOR UPDATE OF s', [assetId]);
      const { rows: [asset] } = await tx.query<Asset & { trashed_by: string | null; trash_reason: string | null }>('SELECT * FROM assets WHERE id=$1 FOR UPDATE', [assetId]);
      if (!asset || !asset.trashed_at) throw new AppError(404, 'Trashed file not found');
      const entry = await entryAccess(tx, actor, asset.submission_id);
      const { rows: [parents] } = await tx.query(`SELECT p.trashed_at,st.trashed_at student_trashed,st.purging student_purging,sc.trashed_at school_trashed,sc.purging school_purging
        FROM student_participations p JOIN students st ON st.id=p.student_id JOIN schools sc ON sc.id=p.school_id WHERE p.id=$1 FOR SHARE OF p,st,sc`, [entry.student_participation_id]);
      if (entry.trashed_at || !parents || parents.trashed_at || parents.student_trashed || parents.school_trashed || parents.student_purging || parents.school_purging) throw new AppError(409, 'Restore parent records before recovering this file');
      const { rows: [revision] } = await tx.query('SELECT asset_ids FROM submission_revisions WHERE submission_id=$1 AND version=$2', [asset.submission_id, asset.revision]);
      if (asset.revision > entry.revision || !revision || !Array.isArray(revision.asset_ids) || revision.asset_ids.includes(asset.id)) throw new AppError(409, 'Archive recovery requires a discarded file outside the immutable submitted file selection');
      await tx.query('UPDATE assets SET trashed_at=NULL,trashed_by=NULL,trash_reason=NULL WHERE id=$1', [asset.id]);
      if (['processing','failed'].includes(asset.status)) await queueVerification(tx, asset.id);
      await audit(tx, actor, 'upload.archive_recover', 'asset', asset.id, { submissionId: asset.submission_id, revision: asset.revision, reason: input.reason, archiveOnly: true, previousTrash: { at: asset.trashed_at, actorId: asset.trashed_by, reason: asset.trash_reason } });
      return ok({ id: asset.id, trashed: false, archived: true, revision: asset.revision });
    });
  }
  if (path.length === 3 && ['trash','restore'].includes(path[2]) && request.method === 'POST') {
    return db.transaction(async tx => {
      requireId(assetId);
      await tx.query('SELECT s.id FROM submissions s JOIN assets a ON a.submission_id=s.id WHERE a.id=$1 FOR UPDATE OF s', [assetId]);
      const restore = path[2] === 'restore';
      const { asset, entry } = await ownedAsset(tx, actor, assetId, true, restore);
      const input = await request.json();
      if (!restore && (typeof input.reason !== 'string' || input.reason.trim().length < 3 || input.reason.length > 2000)) throw new AppError(400, 'A reason is required to move a draft file to Trash');
      if (restore) {
        const {rows:existing} = await tx.query('SELECT role,expected_size,byte_size FROM assets WHERE submission_id=$1 AND revision=$2 AND trashed_at IS NULL', [entry.id, asset.revision]);
        if(asset.trashed_at)validateFileSelection(rulesFor(entry.config),[...existing,asset],false);
        await tx.query('UPDATE assets SET trashed_at=NULL,trashed_by=NULL,trash_reason=NULL WHERE id=$1', [asset.id]);
        if (['processing','failed'].includes(asset.status)) await queueVerification(tx, asset.id);
      } else await tx.query('UPDATE assets SET trashed_at=now(),trashed_by=$2,trash_reason=$3 WHERE id=$1', [asset.id, actor.id, input.reason.trim()]);
      await audit(tx, actor, restore ? 'upload.restore' : 'upload.trash', 'asset', asset.id, { reason: restore ? undefined : input.reason });
      return ok({ id: asset.id, trashed: !restore });
    });
  }
  if (path.length === 2 && request.method === 'GET') {
    const { asset } = await ownedAsset(db, actor, assetId, false);
    const store = asset.status === 'uploading' ? objectStore() : undefined;
    let parts: Awaited<ReturnType<NonNullable<typeof store>['parts']>> = [];
    if (store) {
      try { parts = await store.parts(asset.storage_key, asset.upload_id); }
      catch (error) {
        if ((error as { name?: string }).name !== 'NoSuchUpload' && !isMissing(error)) throw error;
        const head = await store.head(asset.storage_key);
        if (head.ContentLength !== Number(asset.expected_size)) throw new AppError(409, 'Retained upload size does not match');
        return ok({ ...summary(asset), parts: [], needsCompletion: true });
      }
    }
    return ok({ ...summary(asset), parts: parts.map(p => ({ partNumber: p.PartNumber, size: p.Size, etag: p.ETag })) });
  }
  if (path.length === 3 && path[2] === 'parts' && request.method === 'POST') {
    const { asset } = await ownedAsset(db, actor, assetId, true);
    if (asset.status !== 'uploading') throw new AppError(409, 'Upload is no longer accepting parts');
    const { partNumber } = await request.json();
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > summary(asset).partCount) throw new AppError(400, 'Invalid upload part number');
    await db.query('UPDATE assets SET last_activity_at=now() WHERE id=$1', [asset.id]);
    const partBytes = Math.min(Number(asset.part_size), Number(asset.expected_size) - (partNumber - 1) * Number(asset.part_size));
    return ok({ url: await objectStore().sign(asset.storage_key, asset.upload_id, partNumber, partBytes), expiresIn: 300 });
  }
  if (path.length === 3 && path[2] === 'complete' && request.method === 'POST') {
    return db.transaction(async tx => {
      requireId(assetId);
      // Lock the parent first, matching submit and Trash/purge ordering.
      await tx.query('SELECT s.id FROM submissions s JOIN assets a ON a.submission_id=s.id WHERE a.id=$1 FOR UPDATE OF s', [assetId]);
      await tx.query('SELECT id FROM assets WHERE id=$1 FOR UPDATE', [assetId]);
      const { asset } = await ownedAsset(tx, actor, assetId, true);
      if (asset.status === 'ready' || asset.status === 'processing') return ok(summary(asset));
      if (asset.status === 'quarantined') throw new AppError(409, 'This file was quarantined. Upload a corrected file.');
      const store = objectStore();
      let head;
      try { head = await store.head(asset.storage_key); } catch (error) { if (!isMissing(error)) throw error; }
      if (!head) {
        const parts = await store.parts(asset.storage_key, asset.upload_id);
        const count = summary(asset).partCount, size = Number(asset.expected_size), chunk = Number(asset.part_size);
        if (parts.length !== count || parts.some((part, index) => part.PartNumber !== index + 1 || !part.ETag || part.Size !== Math.min(chunk, size - index * chunk))) throw new AppError(409, 'Upload is incomplete or part sizes do not match. Resume the missing parts.');
        await store.complete(asset.storage_key, asset.upload_id, parts);
        head = await store.head(asset.storage_key);
      }
      if (head.ContentLength !== Number(asset.expected_size)) throw new AppError(409, 'Stored file size does not match the upload');
      await tx.query(`UPDATE assets SET status='processing',storage_version=$2,storage_etag=$3,error=NULL,last_activity_at=now() WHERE id=$1`, [asset.id, head.VersionId ?? null, head.ETag ?? null]);
      await queueVerification(tx, asset.id);
      return ok({ ...summary(asset), status: 'processing', error: undefined }, 202);
    });
  }
  return null;
}

export async function verifyAsset(database: Db, assetId: string): Promise<void> {
  const result = await database.query<Asset & { config: { files: FileRules }; purging: boolean; entry_trashed: string | null }>(`SELECT a.*,c.config,s.purging,s.trashed_at AS entry_trashed FROM assets a JOIN submissions s ON s.id=a.submission_id JOIN competitions c ON c.id=s.competition_id WHERE a.id=$1`, [assetId]);
  const asset = result.rows[0];
  if (!asset || asset.purging || asset.trashed_at || asset.entry_trashed || ['ready', 'quarantined', 'uploading'].includes(asset.status)) return;
  try {
    const rules = rulesForRole(rulesFor(asset.config),asset.role), store = objectStore();
    const object = await store.read(asset.storage_key, asset.storage_version ?? undefined, asset.storage_etag ?? undefined);
    if (!object.Body) throw new Error('Stored file could not be read');
    const content = await inspectContent(object.Body as AsyncIterable<Uint8Array>, { size: Number(asset.expected_size), checksum: asset.expected_checksum, maxBytes: rules.maxBytes, types: rules.types });
    const metadataObject = await store.read(asset.storage_key, asset.storage_version ?? undefined, asset.storage_etag ?? undefined);
    if(!metadataObject.Body)throw new Error('Stored metadata could not be inspected');
    let metadata;
    try{metadata=await inspectFileMetadata(metadataObject.Body as AsyncIterable<Uint8Array>,content.mimeType,rules);}
    finally{if('destroy' in metadataObject.Body&&typeof metadataObject.Body.destroy==='function')metadataObject.Body.destroy();}
    const scanObject = await store.read(asset.storage_key, asset.storage_version ?? undefined, asset.storage_etag ?? undefined);
    if (!scanObject.Body) throw new Error('Stored file could not be scanned');
    let scan;
    try { scan = await scanContent(scanObject.Body as AsyncIterable<Uint8Array>, content); }
    finally { if ('destroy' in scanObject.Body && typeof scanObject.Body.destroy === 'function') scanObject.Body.destroy(); }
    // A concurrent purge or Trash action must never restore accessibility.
    await database.query(`UPDATE assets SET status='ready',mime_type=$2,byte_size=$3,checksum=$4,scan_status=$5,scan_detail=$6::jsonb,metadata=$7::jsonb,verified_at=now(),error=NULL WHERE id=$1 AND status IN ('processing','failed') AND trashed_at IS NULL AND EXISTS(SELECT 1 FROM submissions s WHERE s.id=assets.submission_id AND s.trashed_at IS NULL AND NOT s.purging)`, [asset.id, content.mimeType, content.byteSize, content.checksum, scan.status, JSON.stringify(scan.detail),JSON.stringify(metadata)]);
  } catch (error) {
    const rejected = error instanceof ContentRejected;
    await database.query(`UPDATE assets SET status=$2,scan_status=$3,error=$4 WHERE id=$1 AND status IN ('processing','failed')`, [asset.id, rejected ? 'quarantined' : 'failed', rejected ? 'rejected' : 'failed', rejected ? error.message : 'File verification is temporarily unavailable; administrator retry required.']);
    if (!rejected) throw error;
  }
}

async function media(request: Request, actor: Actor, assetId: string) {
  requireId(assetId);
  const checked = mediaAssetSchema.safeParse(await assetAccess(db, actor, assetId));
  if (!checked.success) throw new AppError(404, 'File is not available');
  const asset = checked.data;
  const size = Number(asset.byte_size), rangeHeader = request.headers.get('range');
  let range: { start: number; end: number } | undefined;
  if (rangeHeader) { try { range = parseRange(rangeHeader, size); } catch { return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}`, 'Cache-Control': 'private, no-store' } }); } }
  const filename = actor.role === 'judge' ? anonymousFilename(asset.mime_type) : asset.generated_name || asset.original_name;
  const headers = new Headers({ 'Content-Type': asset.mime_type || 'application/octet-stream', 'Content-Disposition': safeDisposition(asset.mime_type, filename, new URL(request.url).searchParams.get('download') === '1'), 'Accept-Ranges': 'bytes', 'Content-Length': String(range ? range.end - range.start + 1 : size), 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Referrer-Policy': 'no-referrer', 'Vary': 'Cookie' });
  if (range) headers.set('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
  if (request.method === 'HEAD') return new Response(null, { status: range ? 206 : 200, headers });
  const object = await objectStore().read(asset.storage_key, asset.storage_version ?? undefined, asset.storage_etag ?? undefined, range ? `bytes=${range.start}-${range.end}` : undefined);
  if (!object.Body) throw new AppError(503, 'Retained file is temporarily unavailable');
  const body = Readable.toWeb(Readable.from(object.Body as AsyncIterable<Uint8Array>)) as ReadableStream<Uint8Array>;
  return new Response(body, { status: range ? 206 : 200, headers });
}

export async function purgeObjects(keys: string[]): Promise<void> { if (keys.length) await objectStore().purge(keys); }
