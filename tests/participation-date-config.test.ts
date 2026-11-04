import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from './helpers/db';
import { import2027Guidelines } from '../scripts/import-2027-guidelines';
import { configure2027Window } from '../scripts/configure-2027-window';
import { participationWindow } from '../src/data/participation-window';
import { randomUUID } from 'node:crypto';

describe('confirmed 2027 registration and submission dates', () => {
 let store: Awaited<ReturnType<typeof testDb>>, editionId: string;
 beforeAll(async () => { store = await testDb(); editionId = (await import2027Guidelines(store.db)).editionId; });
 afterAll(async () => store?.close());
 it('sets the ten current forms and registration cutoff while preserving approvals, consent, rules and historical drafts', async () => {
  const historical = randomUUID();
  await store.db.query("INSERT INTO competitions(id,edition_id,slug,title,guidelines,version,config) VALUES($1,$2,'waste-to-art','Historical Craft','Original source draft',2,$3)", [historical, editionId, JSON.stringify({ provenance: { importKey: 'yes-2027-supplied-guidelines-v2' } })]);
  const before = (await store.db.query('SELECT id,config,status FROM competitions ORDER BY id')).rows;
  const result = await configure2027Window(store.db);
  expect(result.competitionsUpdated).toBe(10); expect(result.registrationConfigured).toBe(false); expect(result.editionState).toBe('draft');
  const edition = (await store.db.query('SELECT * FROM editions WHERE id=$1', [editionId])).rows[0];
  expect(new Date(edition.registration_closes).toISOString()).toBe(participationWindow.closesAt); expect(edition.config.registrationApproved).toBe(false);
  expect((await store.db.query('SELECT id,config,status FROM competitions ORDER BY id')).rows).toEqual(before);
  expect((await store.db.query('SELECT opens_at,closes_at FROM competitions WHERE id=$1', [historical])).rows[0]).toEqual({ opens_at: null, closes_at: null });
 });
 it('reruns without extra audit records or changing the original configuration', async () => {
  const before = (await store.db.query('SELECT * FROM competitions ORDER BY id')).rows;
  expect(await configure2027Window(store.db)).toMatchObject({ editionChanged: false, competitionsUpdated: 0, competitionsPreserved: 10 });
  expect((await store.db.query('SELECT * FROM competitions ORDER BY id')).rows).toEqual(before);
  expect((await store.db.query("SELECT id FROM audit_events WHERE action='programme.confirm_dates'")).rows).toHaveLength(1);
 });
 it('refuses archived editions without altering their stored dates', async () => {
  await store.db.query("UPDATE editions SET state='archived' WHERE id=$1", [editionId]);
  await expect(configure2027Window(store.db)).rejects.toThrow('archived');
 });
});
