import { describe, expect, it } from 'vitest';
import { buildWordPressDelta, type RetainedWordPressSnapshot } from '../scripts/lib/wordpress-delta';
import { archiveWordPress, fingerprint, validateWordPressExport, type Attachment, type WordPressExport } from '../src/server/wordpress-migration';
import { testDb } from './helpers/db';

const source = 'https://youthecosummit.com';
const entry = (sourceId: string, answer = 'original'): WordPressExport['records'][number] => ({ kind: 'entry', sourceId, payload: { entry_id: sourceId, answer } });
const file = (sourceId: string, entryId = '1'): Attachment => ({ sourceId, entryId, sha256: 'a'.repeat(64), bytes: 12, filename: 'entry.pdf', mimeType: 'application/pdf', path: `attachments/${sourceId}` });
const current = (records = [entry('1')], attachments: Attachment[] = []): WordPressExport => ({ format: 'yes-wordpress-export/v1', source, capturedAt: '2026-11-11T10:00:00Z', counts: { records: records.length, attachments: attachments.length }, records, attachments });
const snapshot = (data: WordPressExport): RetainedWordPressSnapshot => ({ source: data.source, records: data.records.map(record => ({ ...record, checksum: fingerprint(record.payload) })), attachments: data.attachments.map(({ path: _path, ...metadata }) => metadata) });

describe('insert-only WordPress delta', () => {
 it('includes new identities once and produces an empty delta after they are retained', () => {
  const baseline = current();
  const updated = current([entry('1'), entry('2')], [file('new', '2')]);
  const result = buildWordPressDelta(updated, snapshot(baseline));
  expect(result.delta.records.map(record => record.sourceId)).toEqual(['2']);
  expect(result.delta.attachments.map(attachment => attachment.sourceId)).toEqual(['new']);
  expect(result.report.counts.records).toEqual({ current: 2, retained: 1, new: 1, unchanged: 1, conflicts: 0, missingFromCurrent: 0, includedParents: 0 });
  const retry = buildWordPressDelta(updated, snapshot(updated));
  expect(retry.delta.counts).toEqual({ records: 0, attachments: 0 });
  expect(retry.report.counts.attachments.unchanged).toBe(1);
 });

 it('includes the exact retained parent payload for a new file when the current entry changed', () => {
  const retained = snapshot(current());
  const updated = current([entry('1', 'edited')], [file('new')]);
  const original = JSON.stringify({ retained, updated });
  const result = buildWordPressDelta(updated, retained);
  expect(result.delta.records).toEqual([entry('1')]);
  expect(result.delta.attachments).toEqual([file('new')]);
  expect(result.report.recordConflicts).toEqual([{ kind: 'entry', sourceId: '1', retainedChecksum: fingerprint({ entry_id: '1', answer: 'original' }), currentChecksum: fingerprint({ entry_id: '1', answer: 'edited' }) }]);
  expect(result.report.counts.records.includedParents).toBe(1);
  expect(validateWordPressExport(result.delta).counts).toEqual({ records: 1, attachments: 1 });
  expect(JSON.stringify({ retained, updated })).toBe(original);
 });

 it('passes retained parents through the real archive transaction without changing historical payloads', async () => {
  const fixture = await testDb();
  try {
   await archiveWordPress(fixture.db, current(), { commit: true });
   const result = buildWordPressDelta(current([entry('1', 'edited')], [file('new')]), snapshot(current()));
   const imported = await archiveWordPress(fixture.db, result.delta, { commit: true, verifyAttachment: async attachment => ({ storageKey: `wordpress/${'c'.repeat(64)}/${attachment.sha256}`, sha256: attachment.sha256, bytes: attachment.bytes }) });
   expect(imported).toMatchObject({ inserted: 0, unchanged: 1, attachments: 1 });
   expect((await fixture.db.query('SELECT payload FROM wordpress_records')).rows[0].payload).toEqual({ entry_id: '1', answer: 'original' });
   expect((await fixture.db.query('SELECT source_id FROM wordpress_attachments')).rows).toEqual([{ source_id: 'new' }]);
  } finally { await fixture.close(); }
 });

 it('reports source file changes without overwriting them or excluding unrelated new identities', () => {
  const baseline = current([entry('1')], [file('old')]);
  const changed = { ...file('old'), sha256: 'b'.repeat(64), filename: 'renamed.pdf' };
  const result = buildWordPressDelta(current([entry('1'), entry('2')], [changed, file('new', '2')]), snapshot(baseline));
  expect(result.delta.attachments.map(attachment => attachment.sourceId)).toEqual(['new']);
  expect(result.report.attachmentConflicts).toEqual([{ sourceId: 'old', changedFields: ['sha256', 'filename'] }]);
  expect(result.report.counts.attachments.conflicts).toBe(1);
  expect(result.report.recordsByKind.entry).toMatchObject({ current: 2, retained: 1, new: 1, unchanged: 1, conflicts: 0 });
 });

 it('ignores changed export-relative paths but reports retained identities absent from the source', () => {
  const baseline = current([entry('1'), entry('2')], [file('old')]);
  const result = buildWordPressDelta(current([entry('1')], [{ ...file('old'), path: 'attachments/different-export-path' }]), snapshot(baseline));
  expect(result.delta.counts).toEqual({ records: 0, attachments: 0 });
  expect(result.report.missingRecords).toEqual([{ kind: 'entry', sourceId: '2' }]);
  expect(result.report.attachmentConflicts).toEqual([]);
 });

 it('rejects a current attachment with a missing parent even if the retained snapshot has it', () => {
  expect(() => buildWordPressDelta(current([], [file('new')]), snapshot(current()))).toThrow(/parent/i);
 });

 it('rejects corrupt, duplicate, cross-source, or parentless retained snapshots', () => {
  const retained = snapshot(current([entry('1')], [file('old')]));
  expect(() => buildWordPressDelta(current(), { ...retained, source: 'https://different.example' })).toThrow(/source/i);
  expect(() => buildWordPressDelta(current(), { ...retained, records: [{ ...retained.records[0], checksum: 'b'.repeat(64) }] })).toThrow(/checksum/i);
  expect(() => buildWordPressDelta(current(), { ...retained, records: [...retained.records, retained.records[0]] })).toThrow(/duplicate/i);
  expect(() => buildWordPressDelta(current(), { ...retained, attachments: [...retained.attachments, retained.attachments[0]] })).toThrow(/duplicate/i);
  expect(() => buildWordPressDelta(current(), { ...retained, attachments: [{ ...retained.attachments[0], entryId: 'missing' }] })).toThrow(/parent/i);
 });
});
