import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { testDb } from './helpers/db';
import { import2027CompetitionDrafts } from '../scripts/import-2027-competition-drafts';
import { adminPatch } from '../src/server/admin';
import { id, type Actor } from '../src/server/core';

describe('2027 programme draft import', () => {
  let store: Awaited<ReturnType<typeof testDb>>;
  let editionId: string, competitionId: string, existingCompetitionId: string;
  const admin: Actor = { id: id(), role: 'owner' };
  const validRules = { mode: 'individual', entryLimit: 1, minMembers: 1, maxMembers: 1, categories: [{ id: 'example', label: 'Test class', classes: [6] }], fields: [], files: { minCount: 0, maxCount: 1, maxBytes: 1000, types: ['application/pdf'] } };

  beforeAll(async () => {
    store = await testDb();
    await store.db.query("INSERT INTO users(id,role,contact) VALUES($1,'owner','draft-import-test@example.test')", [admin.id]);
    const existingEditionId = id(); existingCompetitionId = id();
    await store.db.query("INSERT INTO editions(id,label,state) VALUES($1,'Existing published test edition','open')", [existingEditionId]);
    await store.db.query("INSERT INTO competitions(id,edition_id,slug,title,guidelines,status,opens_at,closes_at,config) VALUES($1,$2,'existing','Existing test challenge','Approved test instructions','approved',now()-interval '1 day',now()+interval '1 day',$3)", [existingCompetitionId, existingEditionId, JSON.stringify(validRules)]);
  });
  afterAll(async () => { await store?.close(); });

  it('imports exactly eight unscheduled drafts while preserving published records', async () => {
    const before = (await store.db.query('SELECT * FROM competitions WHERE id=$1', [existingCompetitionId])).rows[0];
    const result = await import2027CompetitionDrafts(store.db);
    editionId = result.editionId; competitionId = result.competitions[0].id;
    expect(result.created).toBe(8);
    expect(result.editionCreated).toBe(true);
    expect(result.competitions.map(c => c.title).sort()).toEqual(['Essay', 'Article Writing', 'Blog Writing', 'Short Film Making', 'Spoken Word (Monologue)', 'Painting', 'Waste to Art', 'Eco-Business Model'].sort());
    for (const competition of result.competitions) expect(competition).toMatchObject({ status: 'draft', opens_at: null, closes_at: null });
    const edition = (await store.db.query('SELECT * FROM editions WHERE id=$1', [editionId])).rows[0];
    expect(edition).toMatchObject({ state: 'draft', registration_opens: null, registration_closes: null, event_date: null });
    const draft = (await store.db.query('SELECT config FROM competitions WHERE id=$1', [competitionId])).rows[0];
    expect(draft.config.provenance.sourceEdition).toBe(2026);
    expect(draft.config.provenance.targetEdition).toBe(2027);
    for (const key of ['categories', 'mode', 'entryLimit', 'files', 'fields']) expect(draft.config).not.toHaveProperty(key);
    expect((await store.db.query('SELECT * FROM competitions WHERE id=$1', [existingCompetitionId])).rows[0]).toEqual(before);
    const publicRows = (await store.db.query("SELECT c.id FROM competitions c JOIN editions e ON e.id=c.edition_id WHERE c.status='approved' AND e.state<>'draft'")).rows;
    expect(publicRows).toEqual([{ id: existingCompetitionId }]);
  });

  it('reruns preserve identities, editorial edits and audit history even after an edition rename', async () => {
    await store.db.query("UPDATE editions SET label='Youth Eco Summit 2027 — reviewed title' WHERE id=$1", [editionId]);
    await store.db.query("UPDATE competitions SET guidelines='An organizer has started reviewing this draft.' WHERE id=$1", [competitionId]);
    const before = (await store.db.query('SELECT * FROM competitions WHERE edition_id=$1 ORDER BY id', [editionId])).rows;
    const result = await import2027CompetitionDrafts(store.db);
    expect(result).toMatchObject({ editionId, editionCreated: false, created: 0, preserved: 8 });
    expect((await store.db.query('SELECT * FROM competitions WHERE edition_id=$1 ORDER BY id', [editionId])).rows).toEqual(before);
    expect((await store.db.query("SELECT id FROM audit_events WHERE action='programme.import_drafts'")).rows).toHaveLength(1);
  });

  it('rejects missing dates at the database and admin approval boundaries', async () => {
    for (const status of ['approved', 'closed']) {
      await expect(store.db.query('UPDATE competitions SET status=$2 WHERE id=$1', [competitionId, status])).rejects.toThrow();
    }
    await expect(adminPatch(store.db, admin, 'competitions', competitionId, { action: 'approve', reason: 'Test incomplete draft protection' })).rejects.toThrow('Confirm competition opening and closing dates');
    await store.db.query("UPDATE competitions SET opens_at=now(),closes_at=now()+interval '1 day' WHERE id=$1", [competitionId]);
    await expect(adminPatch(store.db, admin, 'competitions', competitionId, { action: 'approve', reason: 'Test missing rules protection' })).rejects.toThrow();
    expect((await store.db.query('SELECT status FROM competitions WHERE id=$1', [competitionId])).rows[0].status).toBe('draft');
    await store.db.query('UPDATE competitions SET opens_at=NULL,closes_at=NULL WHERE id=$1', [competitionId]);
  });

  it('retains valid competition approval once dates and full rules are supplied', async () => {
    const readyId = id();
    await store.db.query("INSERT INTO competitions(id,edition_id,slug,title,guidelines,opens_at,closes_at,config) VALUES($1,$2,'fully-configured-test','Fully configured test','Approved test instructions',now(),now()+interval '1 day',$3)", [readyId, editionId, JSON.stringify(validRules)]);
    await adminPatch(store.db, admin, 'competitions', readyId, { action: 'approve', reason: 'Valid test rules and dates have been supplied' });
    expect((await store.db.query('SELECT status FROM competitions WHERE id=$1', [readyId])).rows[0].status).toBe('approved');
  });

  it('refuses to append records to an edition that has left draft state', async () => {
    await store.db.query("UPDATE editions SET state='closed' WHERE id=$1", [editionId]);
    const before = (await store.db.query('SELECT * FROM competitions WHERE edition_id=$1 ORDER BY id', [editionId])).rows;
    await expect(import2027CompetitionDrafts(store.db)).rejects.toThrow('not this import’s draft');
    expect((await store.db.query('SELECT * FROM competitions WHERE edition_id=$1 ORDER BY id', [editionId])).rows).toEqual(before);
  });
});
