import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testDb } from './helpers/db';
import { archiveWordPress, verifyWordPressArchive, fingerprint } from '../src/server/wordpress-migration';

describe('insert-only WordPress migration', () => {
 let fixture: Awaited<ReturnType<typeof testDb>>;
 beforeEach(async () => { fixture = await testDb(); });
 afterEach(async () => { await fixture?.close(); });
 const envelope = () => ({ format: 'yes-wordpress-export/v1' as const, source: 'https://youthecosummit.com', capturedAt: '2026-11-04T10:00:00Z', counts: { records: 2, attachments: 0 }, records: [
  { kind: 'user' as const, sourceId: '123', payload: { ID: '123', user_email: 'synthetic@example.org', roles: ['administrator'] } },
  { kind: 'entry' as const, sourceId: '456', payload: { form_id: 48542, user_id: 123, created_at: '2026-10-05T10:00:00Z', meta: [{ name: 'consent-yes-registration', value: true }] } },
 ], attachments: [] });
 it('defaults to dry run without writing data and checks declared counts', async () => {
  const result = await archiveWordPress(fixture.db, envelope());
  expect(result.inserted).toBe(0); expect(result.ready).toBe(2);
  expect((await fixture.db.query('SELECT * FROM wordpress_records')).rows).toHaveLength(0);
  await expect(archiveWordPress(fixture.db, { ...envelope(), counts: { records: 5, attachments: 0 } })).rejects.toThrow(/count/i);
 });
 it('preserves raw metadata, source IDs and existing records; retries are idempotent', async () => {
  const data = envelope();
  expect((await archiveWordPress(fixture.db, data, { commit: true })).inserted).toBe(2);
  const retry = await archiveWordPress(fixture.db, data, { commit: true });
  expect(retry.inserted).toBe(0); expect(retry.unchanged).toBe(2);
  const record = (await fixture.db.query("SELECT * FROM wordpress_records WHERE kind='entry'")).rows[0];
  expect(record.source_id).toBe('456'); expect(record.payload).toEqual(data.records[1].payload);
  expect(record.checksum).toBe(fingerprint(data.records[1].payload));
  expect((await fixture.db.query('SELECT * FROM users')).rows).toHaveLength(0);
  expect((await verifyWordPressArchive(fixture.db, data)).ok).toBe(true);
 });
 it('fails atomically when a source identity changes instead of overwriting history', async () => {
  await archiveWordPress(fixture.db, envelope(), { commit: true });
  const changed = envelope(); changed.records[0].payload.user_email = 'changed@example.org';
  await expect(archiveWordPress(fixture.db, changed, { commit: true })).rejects.toThrow(/conflict/i);
  expect((await fixture.db.query("SELECT payload FROM wordpress_records WHERE kind='user'")).rows[0].payload.user_email).toBe('synthetic@example.org');
 });
 it('rejects duplicate source identities and path traversal before any writes', async () => {
  const data = envelope();
  await expect(archiveWordPress(fixture.db, { ...data, records: [data.records[0], data.records[0]] }, { commit: true })).rejects.toThrow(/duplicate/i);
  await expect(archiveWordPress(fixture.db, { ...data, counts: { records: 2, attachments: 1 }, attachments: [{ sourceId: 'f1', entryId: '456', path: '../secret', sha256: 'a'.repeat(64), bytes: 10, filename: 'file.pdf', mimeType: 'application/pdf' }] })).rejects.toThrow(/path/i);
 });
 it('requires independently verified private object bytes before completing an attachment', async () => {
  const data = { ...envelope(), counts: { records: 2, attachments: 1 }, attachments: [{ sourceId: 'f1', entryId: '456', path: 'attachments/file.pdf', sha256: 'a'.repeat(64), bytes: 10, filename: 'file.pdf', mimeType: 'application/pdf' }] };
  await expect(archiveWordPress(fixture.db, data, { commit: true })).rejects.toThrow(/attachment/i);
  expect((await fixture.db.query('SELECT * FROM wordpress_records')).rows).toHaveLength(0);
 });
});
