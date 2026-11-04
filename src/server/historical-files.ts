import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, realpath, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { z } from 'zod';
import { AppError, audit, id, type Actor } from './core';
import type { Db } from './db';
import { verifyAsset } from './storage';
import { isMissing, objectStore } from './storage/provider';
import type { FileRules } from './storage/validation';

async function owner(database: Db, actor: Actor) {
  if (actor.role !== 'owner') throw new AppError(403, 'Only an owner operator may repair historical originals');
  const user = (await database.query('SELECT active,role FROM users WHERE id=$1 FOR SHARE', [actor.id])).rows[0];
  if (!user?.active || user.role !== 'owner') throw new AppError(403, 'An active owner account is required');
}

async function context(database: Db, fileRefId: string): Promise<Record<string,any> & { rules: FileRules }> {
  const row = (await database.query(`SELECT f.*,s.revision,s.state,s.purging,s.trashed_at AS entry_trashed,c.config,e.state AS edition_state,
    p.trashed_at AS participation_trashed,st.trashed_at AS student_trashed,st.purging AS student_purging,sc.trashed_at AS school_trashed,sc.purging AS school_purging
    FROM historical_file_refs f JOIN imported_submission_history h ON h.submission_id=f.submission_id
    JOIN submissions s ON s.id=f.submission_id JOIN competitions c ON c.id=s.competition_id JOIN editions e ON e.id=c.edition_id
    JOIN student_participations p ON p.id=s.student_participation_id JOIN students st ON st.id=p.student_id JOIN schools sc ON sc.id=p.school_id
    WHERE f.id=$1 FOR UPDATE OF s,f FOR SHARE OF p,st,sc,c,e`, [fileRefId])).rows[0];
  if (!row || row.purging || row.entry_trashed || row.participation_trashed || row.student_trashed || row.student_purging || row.school_trashed || row.school_purging) throw new AppError(404, 'Active historical source reference not found');
  if (row.revision !== 1 || row.state !== 'draft' || !['closed','archived'].includes(row.edition_state)) throw new AppError(409, 'Historical repair requires the original imported revision in a closed or archived edition');
  const rules = row.config?.files as FileRules | undefined;
  if (!rules || !Number.isSafeInteger(rules.maxBytes) || rules.maxBytes <= 0 || !Array.isArray(rules.types) || !rules.types.length) throw new AppError(409, 'Configure approved historical file types and size limits before repair');
  if (!(await database.query('SELECT id FROM submission_revisions WHERE submission_id=$1 AND version=1', [row.submission_id])).rows.length) throw new AppError(409, 'The original historical revision is missing');
  return { ...row, rules };
}

async function localOriginal(path: string, maxBytes: number) {
  if (!path || /^[a-z][a-z0-9+.-]*:\/\//i.test(path)) throw new AppError(400, 'Supply an authorized local file path; URLs are not fetched');
  const resolved = await realpath(path), info = await stat(resolved);
  if (!info.isFile() || !Number.isSafeInteger(info.size) || info.size <= 0 || info.size > maxBytes || info.size > 5 * 1024 ** 4) throw new AppError(422, 'Local original must be a regular file within the configured size limit');
  const hash = createHash('sha256'); let bytes = 0;
  for await (const chunk of createReadStream(resolved)) { bytes += chunk.length; if (bytes > info.size) throw new AppError(409, 'Local file changed while hashing'); hash.update(chunk); }
  if (bytes !== info.size) throw new AppError(409, 'Local file changed while hashing');
  return { path: resolved, size: info.size, checksum: hash.digest('hex'), name: basename(resolved).toWellFormed().replace(/[\u0000-\u001F\u007F]/g,'').slice(0,240) || 'historical-original' };
}

async function enqueue(database: Db, assetId: string) {
  await database.query(`INSERT INTO jobs(id,kind,payload) SELECT $1,'verify_historical_asset',$2::jsonb WHERE NOT EXISTS(SELECT 1 FROM jobs WHERE kind='verify_historical_asset' AND payload->>'assetId'=$3 AND status IN ('pending','running'))`, [id(), JSON.stringify({ assetId }), assetId]);
}

/** CLI-only maintenance entrypoint: local original -> private multipart object -> normal verification. */
export async function importHistoricalFile(database: Db, actor: Actor, input: { fileRefId: string; localPath: string }) {
  const fileRefId = z.uuid().parse(input.fileRefId);
  const initial = await database.transaction(async tx => { await owner(tx,actor); return context(tx,fileRefId); });
  const file = await localOriginal(input.localPath,initial.rules.maxBytes);
  const store = objectStore();
  // Persist the generated object key and upload ID before long transfers, so a retry resumes it.
  const assetId = await database.transaction(async tx => {
    await owner(tx,actor); const ref = await context(tx,fileRefId);
    const existing = ref.asset_id ? (await tx.query('SELECT * FROM assets WHERE id=$1 FOR UPDATE',[ref.asset_id])).rows[0] : null;
    if (existing && (existing.submission_id !== ref.submission_id || existing.revision !== 1)) throw new AppError(409,'The historical source points to an unrelated asset');
    if (existing?.status === 'ready' && (existing.expected_checksum !== file.checksum || Number(existing.expected_size) !== file.size)) throw new AppError(409, 'A verified historical original cannot be silently replaced');
    if (existing && existing.expected_checksum === file.checksum && Number(existing.expected_size) === file.size) {
      if (existing.status === 'quarantined') throw new AppError(409, 'This original was quarantined; supply a corrected file');
      if (existing.trashed_at) throw new AppError(409, 'Restore the retained original before repair');
      return existing.id as string;
    }
    const assetId = id(), key = `submissions/${ref.submission_id}/${assetId}`;
    const partSize = Math.max(8 * 1024 ** 2,Math.ceil(file.size / 10000 / 1024 ** 2) * 1024 ** 2);
    const uploadId = await store.begin(key);
    await tx.query(`INSERT INTO assets(id,submission_id,revision,uploader_id,original_name,storage_key,expected_size,expected_checksum,part_size,upload_id)
      VALUES($1,$2,1,$3,$4,$5,$6,$7,$8,$9)`,[assetId,ref.submission_id,actor.id,file.name,key,file.size,file.checksum,partSize,uploadId]);
    await tx.query("UPDATE historical_file_refs SET asset_id=$2,status='missing',last_error=NULL WHERE id=$1",[fileRefId,assetId]);
    await tx.query("UPDATE imported_submission_history SET retention_status='missing' WHERE submission_id=$1",[ref.submission_id]);
    await audit(tx,actor,'historical.file.started','submissions',ref.submission_id,{fileRefId,assetId,replacedAssetId:existing?.id ?? null});
    return assetId;
  });
  try {
    // Hold the parent locks during the transfer, preventing Trash/purge from racing a copy.
    await database.transaction(async tx => {
      await owner(tx,actor); const ref = await context(tx,fileRefId);
      if (ref.asset_id !== assetId) throw new AppError(409, 'Another operator replaced this repair; reload its status');
      const asset = (await tx.query('SELECT * FROM assets WHERE id=$1 FOR UPDATE',[assetId])).rows[0];
      if (asset.status === 'ready') {
        const retained = await store.head(asset.storage_key,asset.storage_version ?? undefined);
        if (retained.ContentLength !== file.size || retained.ETag !== asset.storage_etag) throw new AppError(409,'The verified original is unavailable or changed; use the documented recovery process');
        return;
      }
      if (asset.status === 'quarantined') throw new AppError(409,'This original was quarantined; supply a corrected file');
      let head;
      try { head = await store.head(asset.storage_key); } catch (error) { if (!isMissing(error)) throw error; }
      if (!head) {
        const uploaded = await store.parts(asset.storage_key,asset.upload_id), handle = await open(file.path,'r');
        try {
          const partSize = Number(asset.part_size);
          for (let offset=0,number=1;offset<file.size;offset+=partSize,number++) {
            const length = Math.min(partSize,file.size-offset);
            if (uploaded.some(part => part.PartNumber === number && part.Size === length && part.ETag)) continue;
            const bytes = Buffer.alloc(length); let read = 0;
            while (read < length) { const result = await handle.read(bytes,read,length-read,offset+read); if (!result.bytesRead) throw new AppError(409,'Local file changed during transfer'); read += result.bytesRead; }
            await store.uploadPart(asset.storage_key,asset.upload_id,number,bytes);
          }
        } finally { await handle.close(); }
        const parts = await store.parts(asset.storage_key,asset.upload_id), partSize = Number(asset.part_size);
        if (parts.length !== Math.ceil(file.size/partSize) || parts.some((part,index) => part.PartNumber !== index+1 || !part.ETag || part.Size !== Math.min(partSize,file.size-index*partSize))) throw new AppError(409,'Storage reports incomplete historical file parts');
        await store.complete(asset.storage_key,asset.upload_id,parts); head = await store.head(asset.storage_key);
      }
      if (head.ContentLength !== file.size || !head.ETag) throw new AppError(409,'Stored original size or identity could not be verified');
      await tx.query("UPDATE assets SET status='processing',storage_version=$2,storage_etag=$3,error=NULL,last_activity_at=now() WHERE id=$1",[assetId,head.VersionId ?? null,head.ETag]);
      await enqueue(tx,assetId);
    });
    // The durable job also runs this path if the operator process exits here.
    await verifyHistoricalAsset(database,assetId);
  } catch (error) {
    await database.query("UPDATE historical_file_refs SET last_error='Historical copy or verification failed; retry the owner import command.' WHERE id=$1 AND asset_id=$2 AND status<>'retained'",[fileRefId,assetId]);
    throw error;
  }
  const result = (await database.query(`SELECT a.status,h.retention_status FROM assets a JOIN imported_submission_history h ON h.submission_id=a.submission_id WHERE a.id=$1`,[assetId])).rows[0];
  if (!result) throw new AppError(409,'The historical record was removed during repair');
  return { assetId, status:result.status as string, retentionStatus:result.retention_status as string };
}

/** Durable worker handler for verify_historical_asset jobs. */
export async function verifyHistoricalAsset(database: Db, assetId: string) {
  let verificationError: unknown;
  try { await verifyAsset(database,assetId); } catch (error) { verificationError = error; }
  await database.transaction(async tx => {
    const link = (await tx.query('SELECT id FROM historical_file_refs WHERE asset_id=$1',[assetId])).rows[0];
    if (!link) return;
    let ref;
    try { ref = await context(tx,link.id); } catch (error) { if (error instanceof AppError && error.status === 404) return; throw error; }
    if (ref.asset_id !== assetId) return;
    const asset = (await tx.query('SELECT status,error,trashed_at,uploader_id FROM assets WHERE id=$1',[assetId])).rows[0];
    if (!asset) return;
    await tx.query('UPDATE historical_file_refs SET status=$2,last_error=$3 WHERE id=$1',[ref.id,asset.status === 'ready' && !asset.trashed_at ? 'retained' : asset.status === 'quarantined' ? 'inaccessible' : 'missing',asset.status === 'ready' ? null : asset.error || 'Original is not yet verified']);
    const sources = (await tx.query(`SELECT f.id,f.status,a.id AS asset_id,a.status AS asset_status,a.revision,a.trashed_at FROM historical_file_refs f LEFT JOIN assets a ON a.id=f.asset_id AND a.submission_id=f.submission_id WHERE f.submission_id=$1 ORDER BY f.created_at,f.id`,[ref.submission_id])).rows;
    const ready = sources.filter(source => source.status === 'retained' && source.asset_status === 'ready' && source.revision === 1 && !source.trashed_at);
    const verified = sources.length > 0 && sources.length === ready.length && sources.length >= (ref.rules.minCount ?? 0);
    await tx.query('UPDATE imported_submission_history SET retention_status=$2 WHERE submission_id=$1',[ref.submission_id,verified ? 'verified' : 'missing']);
    await tx.query("UPDATE submission_revisions SET asset_ids=$2::jsonb,context=jsonb_set(context,'{import,retentionVerified}',$3::jsonb,true) WHERE submission_id=$1 AND version=1",[ref.submission_id,JSON.stringify([...new Set(ready.map(source => source.asset_id))]),JSON.stringify(verified)]);
    await tx.query("UPDATE import_rows i SET payload=jsonb_set(i.payload,'{summary,missingFiles}',$2::jsonb,true),updated_at=now() FROM imported_submission_history h WHERE h.import_row_id=i.id AND h.submission_id=$1",[ref.submission_id,JSON.stringify(sources.length-ready.length)]);
    const status = asset.status === 'ready' && !asset.trashed_at ? 'retained' : asset.status === 'quarantined' ? 'inaccessible' : 'missing';
    if (ref.status !== status) await audit(tx,{id:asset.uploader_id,role:'owner'},'historical.file.verified','submissions',ref.submission_id,{fileRefId:ref.id,assetId,status,retentionVerified:verified});
  });
  if (verificationError) throw verificationError;
}
