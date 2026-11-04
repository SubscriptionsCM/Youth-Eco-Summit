import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { id, type Actor } from '../src/server/core';
import { importHistoricalFile, verifyHistoricalAsset } from '../src/server/historical-files';
import * as provider from '../src/server/storage/provider';

describe('organizer-controlled historical file repair', () => {
  let fixture: Awaited<ReturnType<typeof import('./helpers/db').testDb>>, folder: string;
  const actor: Actor = { id: id(), role: 'owner' };
  const school = id(), student = id(), participation = id(), edition = id(), competition = id(), submission = id(), source = id(), refs = [id(), id()];
  const files = [Buffer.from('%PDF-1.7\n First historical original'), Buffer.from('%PDF-1.7\n Second historical original')];
  const objects = new Map<string, Buffer>(), parts = new Map<string, Map<number, Buffer>>();
  let malware = false;
  const fake = {
    async begin(key: string) { parts.set(key, new Map()); return key; },
    async uploadPart(key: string, _upload: string, number: number, body: Uint8Array) { parts.get(key)!.set(number, Buffer.from(body)); return {}; },
    async parts(key: string) { return [...parts.get(key)!].map(([PartNumber, bytes]) => ({ PartNumber, Size: bytes.length, ETag: String(PartNumber) })).sort((a,b) => a.PartNumber-b.PartNumber); },
    async complete(key: string) { objects.set(key, Buffer.concat([...parts.get(key)!].sort((a,b) => a[0]-b[0]).map(x => x[1]))); return {}; },
    async head(key: string) { const content = objects.get(key); if (!content) throw Object.assign(new Error('missing'),{name:'NotFound'}); return { ContentLength:content.length, ETag:'stored', VersionId:'version-1' }; },
    async read(key: string) { async function* stream() { yield objects.get(key)!; } return { Body:stream() }; },
  } as unknown as provider.S3Store;
  beforeAll(async () => {
    const { testDb } = await import('./helpers/db'); fixture = await testDb();
    folder = await mkdtemp(join(tmpdir(),'yes-historical-'));
    for (let n=0;n<files.length;n++) await writeFile(join(folder,`${n}.pdf`),files[n]);
    vi.spyOn(provider,'objectStore').mockReturnValue(fake);
    vi.stubEnv('FILE_SCAN_URL','https://scanner.example.test/scan'); vi.stubEnv('STORAGE_DEV_SKIP_SCAN','false');
    vi.stubGlobal('fetch',async (_url: unknown, options: RequestInit) => Response.json({ clean:!malware, sha256:new Headers(options.headers).get('X-Content-SHA256') }));
    await fixture.db.query("INSERT INTO users(id,role,contact) VALUES($1,'owner','owner@example.test')",[actor.id]);
    await fixture.db.query("INSERT INTO editions(id,label,state) VALUES($1,'Archive','archived')",[edition]);
    await fixture.db.query("INSERT INTO schools(id,reference,name,address,city,state,postal_code,status) VALUES($1,$2,'School','Street','City','State','100000','active')",[school,school]);
    await fixture.db.query("INSERT INTO students(id,reference,name,guardian_contact) VALUES($1,$2,'Historical student','')",[student,student]);
    await fixture.db.query("INSERT INTO student_participations(id,student_id,school_id,edition_id,class,snapshot) VALUES($1,$2,$3,$4,6,'{}')",[participation,student,school,edition]);
    await fixture.db.query("INSERT INTO competitions(id,edition_id,slug,title,guidelines,opens_at,closes_at,config) VALUES($1,$2,'archive','Archive','Approved historical rules','2018-01-01','2018-12-31',$3)",[competition,edition,JSON.stringify({files:{minCount:2,maxCount:2,maxBytes:1000,types:['application/pdf']}})]);
    await fixture.db.query("INSERT INTO import_rows(id,source,source_id,kind,payload,status,entity_id) VALUES($1,'archive','entry','submissions','{\"summary\":{\"missingFiles\":2}}','imported',$2)",[source,submission]);
    await fixture.db.query("INSERT INTO submissions(id,reference,student_participation_id,competition_id,category_id,revision) VALUES($1,$2,$3,$4,'junior',1)",[submission,submission,participation,competition]);
    await fixture.db.query("INSERT INTO submission_revisions(id,submission_id,version,answers,context,asset_ids,config,submitted_by) VALUES($1,$2,1,'{}','{\"import\":{\"retentionVerified\":false}}','[]','{}',$3)",[id(),submission,actor.id]);
    await fixture.db.query("INSERT INTO imported_submission_history(submission_id,import_row_id,original_state,retention_status) VALUES($1,$2,'winner','missing')",[submission,source]);
    for (let n=0;n<refs.length;n++) await fixture.db.query('INSERT INTO historical_file_refs(id,submission_id,source_url) VALUES($1,$2,$3)',[refs[n],submission,`https://drive.example.test/${n}`]);
  });
  afterAll(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); await fixture?.close(); if(folder){ for(let n=0;n<files.length;n++)await unlink(join(folder,`${n}.pdf`));await rmdir(folder); } });

  it('rejects non-owners and URL input without copying any objects',async () => {
    await expect(importHistoricalFile(fixture.db,{...actor,role:'admin'},{fileRefId:refs[0],localPath:join(folder,'0.pdf')})).rejects.toMatchObject({status:403});
    await expect(importHistoricalFile(fixture.db,actor,{fileRefId:refs[0],localPath:'https://internal.example.test/file'})).rejects.toThrow('local');
    expect(objects.size).toBe(0);
  });
  it('retains a private original on revision 1 while other source files remain missing',async () => {
    const result = await importHistoricalFile(fixture.db,actor,{fileRefId:refs[0],localPath:join(folder,'0.pdf')});
    expect(result.status).toBe('ready'); expect(result.retentionStatus).toBe('missing');
    const asset = (await fixture.db.query('SELECT * FROM assets WHERE id=$1',[result.assetId])).rows[0];
    expect(asset.revision).toBe(1); expect(asset.checksum).toBe(createHash('sha256').update(files[0]).digest('hex'));
    expect((await fixture.db.query('SELECT status FROM historical_file_refs WHERE id=$1',[refs[0]])).rows[0].status).toBe('retained');
    expect((await fixture.db.query('SELECT count(*)::int count FROM participant_access')).rows[0].count).toBe(0);
    expect((await fixture.db.query('SELECT count(*)::int count FROM consents')).rows[0].count).toBe(0);
    const repeat = await importHistoricalFile(fixture.db,actor,{fileRefId:refs[0],localPath:join(folder,'0.pdf')});
    expect(repeat.assetId).toBe(result.assetId); expect(objects.size).toBe(1);
  });
  it('quarantines failed originals and verifies history only once every reference is ready',async () => {
    malware=true;
    const rejected = await importHistoricalFile(fixture.db,actor,{fileRefId:refs[1],localPath:join(folder,'1.pdf')});
    expect(rejected.status).toBe('quarantined'); expect(rejected.retentionStatus).toBe('missing');
    expect((await fixture.db.query('SELECT status FROM historical_file_refs WHERE id=$1',[refs[1]])).rows[0].status).toBe('inaccessible');
    malware=false;
    // Corrected original gets a new immutable asset; the quarantined object is retained.
    const corrected = Buffer.from('%PDF-1.7\n Corrected second original'); await writeFile(join(folder,'1.pdf'),corrected);
    const result = await importHistoricalFile(fixture.db,actor,{fileRefId:refs[1],localPath:join(folder,'1.pdf')});
    expect(result.status).toBe('ready'); expect(result.retentionStatus).toBe('verified');
    expect((await fixture.db.query('SELECT state FROM submissions WHERE id=$1',[submission])).rows[0].state).toBe('draft');
    expect((await fixture.db.query('SELECT asset_ids FROM submission_revisions WHERE submission_id=$1',[submission])).rows[0].asset_ids).toHaveLength(2);
    await verifyHistoricalAsset(fixture.db,result.assetId);
    expect((await fixture.db.query('SELECT count(*)::int count FROM assets')).rows[0].count).toBe(3);
  });
});
