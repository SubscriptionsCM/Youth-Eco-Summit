import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Db } from './db';

const recordSchema = z.object({ kind: z.enum(['user','entry','school','form','option','post']), sourceId: z.string().min(1).max(250), payload: z.record(z.string(),z.unknown()) });
const attachmentSchema = z.object({ sourceId: z.string().min(1).max(250), entryId: z.string().min(1), path: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), filename: z.string().min(1), mimeType: z.string().min(1) });
const envelopeSchema = z.object({ format: z.literal('yes-wordpress-export/v1'), source: z.url(), capturedAt: z.iso.datetime({offset:true}), counts: z.object({ records:z.number().int().nonnegative(), attachments:z.number().int().nonnegative() }), records:z.array(recordSchema), attachments:z.array(attachmentSchema) });
export type WordPressExport = z.infer<typeof envelopeSchema>;
export type Attachment = z.infer<typeof attachmentSchema>;
export type VerifiedAttachment = { storageKey: string; sha256: string; bytes: number };
function canonical(value: unknown): string {
 if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
 if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(',')}}`;
 return JSON.stringify(value);
}
export function fingerprint(value: unknown) { return createHash('sha256').update(canonical(value)).digest('hex'); }
export function validateWordPressExport(input: unknown): WordPressExport {
 const data = envelopeSchema.parse(input);
 if (data.counts.records !== data.records.length || data.counts.attachments !== data.attachments.length) throw new Error('Source manifest count mismatch.');
 const ids = new Set<string>();
 for (const record of data.records) {
  const key = `${record.kind}:${record.sourceId}`;
  if (ids.has(key)) throw new Error('Duplicate source identity in export.'); ids.add(key);
 }
 const files = new Set<string>();
 for (const file of data.attachments) {
  if (/^[a-z]:|^[/\\]|\\|\0/i.test(file.path) || file.path.split('/').some(part=>part==='..'||part==='.'||!part)) throw new Error('Attachment path must stay within the private export directory.');
  if (files.has(file.sourceId)) throw new Error('Duplicate attachment source identity.'); files.add(file.sourceId);
  if (!ids.has(`entry:${file.entryId}`)) throw new Error('Attachment parent entry is missing from export.');
 }
 return data;
}
export async function archiveWordPress(db: Db, input: unknown, options: { commit?: boolean; verifyAttachment?: (file: Attachment) => Promise<VerifiedAttachment> } = {}) {
 const data = validateWordPressExport(input);
 const result = { ready: 0, unchanged: 0, inserted: 0, attachments: data.attachments.length, committed: !!options.commit };
 // Preflight the complete batch before copying files or writing any records.
 for (const record of data.records) {
  const { rows:[old] } = await db.query('SELECT checksum FROM wordpress_records WHERE source=$1 AND kind=$2 AND source_id=$3',[data.source,record.kind,record.sourceId]);
  if (old && old.checksum !== fingerprint(record.payload)) throw new Error(`Source conflict (${record.kind}). Retained data was not overwritten.`);
  old ? result.unchanged++ : result.ready++;
 }
 for (const file of data.attachments) {
  const { rows:[old] } = await db.query('SELECT a.*,r.source_id entry_source_id FROM wordpress_attachments a JOIN wordpress_records r ON r.id=a.entry_record_id WHERE a.source=$1 AND a.source_id=$2',[data.source,file.sourceId]);
  if (old && (old.checksum!==file.sha256 || Number(old.byte_size)!==file.bytes || old.entry_source_id!==file.entryId || old.filename!==file.filename || old.mime_type!==file.mimeType)) throw new Error('Attachment source conflict. Retained files were not overwritten.');
 }
 if (!options.commit) return result;
 if (data.attachments.length && !options.verifyAttachment) throw new Error('Attachment verification adapter is required before committing.');
 const verified = new Map<string,VerifiedAttachment>();
 for (const file of data.attachments) {
  const object = await options.verifyAttachment!(file);
  if (object.sha256 !== file.sha256 || object.bytes !== file.bytes || !/^wordpress\/[a-f0-9]{64}\/[a-f0-9]{64}$/.test(object.storageKey)) throw new Error('Attachment bytes or checksum could not be verified.');
  verified.set(file.sourceId,object);
 }
 await db.transaction(async tx => {
  // Serializes imports and rechecks source conflicts under the same transaction.
  await tx.query('LOCK TABLE wordpress_records,wordpress_attachments IN EXCLUSIVE MODE');
  for (const record of data.records) {
   const checksum = fingerprint(record.payload);
   const { rows:[old] } = await tx.query('SELECT id,checksum FROM wordpress_records WHERE source=$1 AND kind=$2 AND source_id=$3',[data.source,record.kind,record.sourceId]);
   if (old) { if (old.checksum!==checksum) throw new Error('Concurrent source conflict; migration rolled back.'); continue; }
   await tx.query('INSERT INTO wordpress_records(id,source,kind,source_id,payload,checksum,captured_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),data.source,record.kind,record.sourceId,JSON.stringify(record.payload),checksum,data.capturedAt]); result.inserted++;
  }
  for (const file of data.attachments) {
   const object = verified.get(file.sourceId)!;
   const { rows:[parent] } = await tx.query("SELECT id FROM wordpress_records WHERE source=$1 AND kind='entry' AND source_id=$2",[data.source,file.entryId]);
   const { rows:[old] } = await tx.query('SELECT * FROM wordpress_attachments WHERE source=$1 AND source_id=$2',[data.source,file.sourceId]);
   if (old) { if (old.checksum!==file.sha256 || Number(old.byte_size)!==file.bytes || old.entry_record_id!==parent.id || old.filename!==file.filename || old.mime_type!==file.mimeType) throw new Error('Concurrent attachment conflict.'); continue; }
   await tx.query('INSERT INTO wordpress_attachments(id,source,source_id,entry_record_id,filename,mime_type,byte_size,checksum,storage_key,verified_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now())',[randomUUID(),data.source,file.sourceId,parent.id,file.filename,file.mimeType,file.bytes,file.sha256,object.storageKey]);
  }
 });
 return result;
}
export async function verifyWordPressArchive(db: Db, input: unknown, verifyAttachment?: (file:Attachment)=>Promise<VerifiedAttachment>) {
 const data = validateWordPressExport(input);
 let records = 0, attachments = 0; const issues: string[] = [];
 for (const record of data.records) {
  const { rows:[old] } = await db.query('SELECT payload,checksum FROM wordpress_records WHERE source=$1 AND kind=$2 AND source_id=$3',[data.source,record.kind,record.sourceId]);
  if (!old || old.checksum!==fingerprint(record.payload) || fingerprint(old.payload)!==old.checksum) issues.push(`Record mismatch: ${record.kind}:${record.sourceId}`); else records++;
 }
 for (const file of data.attachments) {
  const { rows:[old] } = await db.query('SELECT a.*,r.source_id entry_source_id FROM wordpress_attachments a JOIN wordpress_records r ON r.id=a.entry_record_id WHERE a.source=$1 AND a.source_id=$2',[data.source,file.sourceId]);
  if (!old || old.checksum!==file.sha256 || Number(old.byte_size)!==file.bytes || old.entry_source_id!==file.entryId || old.filename!==file.filename || old.mime_type!==file.mimeType) { issues.push(`Attachment mismatch: ${file.sourceId}`); continue; }
  if (!verifyAttachment) { issues.push(`Object bytes not checked: ${file.sourceId}`); continue; }
  const object = await verifyAttachment(file);
  if (object.sha256!==file.sha256 || object.bytes!==file.bytes || object.storageKey!==old.storage_key) issues.push(`Object checksum mismatch: ${file.sourceId}`); else attachments++;
 }
 return { ok: issues.length===0, records, attachments, expected:data.counts, issues };
}
