import { fingerprint, validateWordPressExport, type Attachment, type WordPressExport } from '../../src/server/wordpress-migration';

type WordPressRecord = WordPressExport['records'][number];
type RecordIdentity = Pick<WordPressRecord, 'kind' | 'sourceId'>;
type RecordCounts = { current: number; retained: number; new: number; unchanged: number; conflicts: number; missingFromCurrent: number; includedParents: number };
type AttachmentMetadata = Omit<Attachment, 'path'>;

/** A complete, source-scoped metadata snapshot read from the retained archive. */
export type RetainedWordPressSnapshot = {
 source: string;
 records: (WordPressRecord & { checksum: string })[];
 attachments: AttachmentMetadata[];
};

const key = (record: RecordIdentity) => `${record.kind}:${record.sourceId}`;
const identity = ({ kind, sourceId }: RecordIdentity): RecordIdentity => ({ kind, sourceId });
const emptyCounts = (): RecordCounts => ({ current: 0, retained: 0, new: 0, unchanged: 0, conflicts: 0, missingFromCurrent: 0, includedParents: 0 });
const attachmentFields = ['entryId', 'sha256', 'bytes', 'filename', 'mimeType'] as const;

/**
 * Builds an append-only batch without accessing a database or the filesystem.
 * Changed existing identities are explicitly reported and excluded, never updated.
 * New attachments to existing entries include the retained parent payload so the
 * existing archive validator and transactional conflict checks remain authoritative.
 * Callers must persist/review the report: a valid delta does not resolve conflicts.
 */
export function buildWordPressDelta(input: unknown, retained: RetainedWordPressSnapshot) {
 const current = validateWordPressExport(input);
 if (retained.source !== current.source) throw new Error('Retained snapshot source does not match the current export.');
 // Retained file metadata has no export path. This validation-only path is never
 // emitted or used to read a file; all other constraints use the existing validator.
 const previous = validateWordPressExport({
  ...current,
  counts: { records: retained.records.length, attachments: retained.attachments.length },
  records: retained.records,
  attachments: retained.attachments.map(file => ({ ...file, path: 'attachments/metadata-only' })),
 });
 const oldRecords = new Map(previous.records.map((record, index) => {
  if (fingerprint(record.payload) !== retained.records[index].checksum) throw new Error(`Retained record checksum mismatch: ${key(record)}.`);
  return [key(record), record] as const;
 }));
 const oldAttachments = new Map(previous.attachments.map(file => [file.sourceId, file]));
 const currentRecords = new Set(current.records.map(key));
 const currentAttachments = new Set(current.attachments.map(file => file.sourceId));
 const records: WordPressRecord[] = [];
 const attachments: Attachment[] = [];
 const newRecords: RecordIdentity[] = [];
 const newAttachments: string[] = [];
 const includedParents: RecordIdentity[] = [];
 const recordConflicts: (RecordIdentity & { retainedChecksum: string; currentChecksum: string })[] = [];
 const attachmentConflicts: { sourceId: string; changedFields: (typeof attachmentFields)[number][] }[] = [];
 const recordsByKind = Object.fromEntries(['user', 'entry', 'school', 'form', 'option', 'post'].map(kind => [kind, emptyCounts()])) as Record<WordPressRecord['kind'], RecordCounts>;
 let unchangedAttachments = 0;

 for (const record of previous.records) recordsByKind[record.kind].retained++;
 for (const record of current.records) {
  const counts = recordsByKind[record.kind];
  counts.current++;
  const old = oldRecords.get(key(record));
  if (!old) {
   records.push(record); newRecords.push(identity(record)); counts.new++;
  } else {
   const retainedChecksum = fingerprint(old.payload), currentChecksum = fingerprint(record.payload);
   if (retainedChecksum === currentChecksum) counts.unchanged++;
   else { recordConflicts.push({ ...identity(record), retainedChecksum, currentChecksum }); counts.conflicts++; }
  }
 }
 const includedRecordKeys = new Set(records.map(key));
 for (const file of current.attachments) {
  const old = oldAttachments.get(file.sourceId);
  if (old) {
   const changedFields = attachmentFields.filter(field => old[field] !== file[field]);
   if (changedFields.length) attachmentConflicts.push({ sourceId: file.sourceId, changedFields });
   else unchangedAttachments++;
   continue;
  }
  attachments.push(file); newAttachments.push(file.sourceId);
  const parentKey = `entry:${file.entryId}`;
  if (!includedRecordKeys.has(parentKey)) {
   const parent = oldRecords.get(parentKey);
   if (!parent) throw new Error(`New attachment parent is missing: ${file.entryId}.`);
   records.push(parent); includedParents.push(identity(parent));
   includedRecordKeys.add(parentKey); recordsByKind.entry.includedParents++;
  }
 }
 const missingRecords = previous.records.filter(record => !currentRecords.has(key(record))).map(identity);
 const missingAttachments = previous.attachments.filter(file => !currentAttachments.has(file.sourceId)).map(file => file.sourceId);
 for (const record of missingRecords) recordsByKind[record.kind].missingFromCurrent++;
 const recordCounts = emptyCounts();
 for (const counts of Object.values(recordsByKind)) {
  for (const field of Object.keys(recordCounts) as (keyof RecordCounts)[]) recordCounts[field] += counts[field];
 }
 const delta = validateWordPressExport({ ...current, counts: { records: records.length, attachments: attachments.length }, records, attachments });
 return {
  delta,
  report: {
   counts: {
    records: recordCounts,
    attachments: { current: current.attachments.length, retained: previous.attachments.length, new: attachments.length, unchanged: unchangedAttachments, conflicts: attachmentConflicts.length, missingFromCurrent: missingAttachments.length },
   },
   recordsByKind, newRecords, newAttachments, includedParents,
   recordConflicts, attachmentConflicts, missingRecords, missingAttachments,
  },
 };
}
