import {beforeEach,afterEach,describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {testDb} from './helpers/db';
import {importPreview,commitImport} from '../src/server/imports';
import type {Actor} from '../src/server/core';

describe('reviewed historical imports',()=>{
  let fixture:Awaited<ReturnType<typeof testDb>>;
  let actor:Actor;
  let editionId:string;
  beforeEach(async()=>{
    fixture=await testDb(); actor={id:randomUUID(),role:'owner'};editionId=randomUUID();
    await fixture.db.query("insert into users(id,role,contact) values($1,'owner','owner@example.org')",[actor.id]);
    await fixture.db.query("insert into editions(id,label,state) values($1,'Historical edition','archived')",[editionId]);
  });
  afterEach(async()=>fixture?.close());
  const school = {sourceId:'school-1',name:'Historical School',address:'1 School Road',city:'Delhi',state:'Delhi',postalCode:'110001',registeredAt:'2018-06-01T00:00:00Z',approval:'approved'};
  async function previewSchool(){return importPreview(fixture.db,actor,{source:'archive',kind:'schools',rows:[school],mapping:{},schoolMatches:{'school-1':'new'}});}
  async function commit(preview:Awaited<ReturnType<typeof importPreview>>){return commitImport(fixture.db,actor,{rows:preview.rows.map(row=>({id:row.id,version:row.version})),reviewed:true});}

  it('requires explicit school reconciliation and does not auto-merge by name',async()=>{
    const first=await previewSchool(); await commit(first);
    const unreviewed=await importPreview(fixture.db,actor,{source:'second-export',kind:'schools',rows:[{...school,sourceId:'school-2'}],mapping:{}});
    expect(unreviewed.rows[0].status).toBe('needs_review');
    expect(unreviewed.rows[0].candidates).toHaveLength(1);
    const result=await commit(unreviewed);
    expect(result.imported).toBe(0);
    expect(result.errors).toBe(1);
    expect((await fixture.db.query('select count(*)::int count from schools')).rows[0].count).toBe(1);
  });

  it('imports original school dates once, rejects stale previews, and minimizes saved payloads',async()=>{
    const stale=await previewSchool(); const fresh=await previewSchool();
    expect((await commit(stale)).errors).toBe(1);
    const first=await commit(fresh);expect(first.imported).toBe(1);
    expect((await commit(fresh)).duplicates).toBe(1);
    const repeated=await previewSchool(); expect(repeated.rows[0].status).toBe('duplicate');
    const record=(await fixture.db.query('select * from schools')).rows[0];
    expect(new Date(record.registered_at).toISOString()).toBe('2018-06-01T00:00:00.000Z');
    const source=(await fixture.db.query('select payload from import_rows')).rows[0].payload;
    expect(source).not.toHaveProperty('data');
  });

  it('keeps siblings distinct and creates no contact-based access during import',async()=>{
    await commit(await previewSchool());
    const preview=await importPreview(fixture.db,actor,{source:'archive',kind:'participations',editionId,mapping:{sourceId:'record',name:'student'},rows:[
      {record:'r1',student:'Alex',guardianContact:'+919876543210',class:6,schoolSourceId:'school-1'},
      {record:'r2',student:'Alex',guardianContact:'+919876543210',class:6,schoolSourceId:'school-1'},
    ]});
    expect((await commit(preview)).imported).toBe(2);
    expect((await fixture.db.query('select count(*)::int count from students')).rows[0].count).toBe(2);
    expect((await fixture.db.query('select count(*)::int count from participant_access')).rows[0].count).toBe(0);
    expect((await commit(preview)).duplicates).toBe(2);
  });

  it('preserves an earlier source registration date without rewriting the matched school',async()=>{
    await commit(await previewSchool());
    const existing=(await fixture.db.query('select id,registered_at from schools')).rows[0];
    const preview=await importPreview(fixture.db,actor,{source:'older-archive',kind:'schools',rows:[{...school,registeredAt:'2010-04-01T00:00:00Z'}],schoolMatches:{'school-1':existing.id}});
    expect((await commit(preview)).imported).toBe(1);
    const provenance=(await fixture.db.query("select payload from import_rows where source='older-archive'")).rows[0].payload;
    expect(provenance.summary.sourceRegisteredAt).toBe('2010-04-01T00:00:00Z');
    expect(new Date((await fixture.db.query('select registered_at from schools where id=$1',[existing.id])).rows[0].registered_at).toISOString()).toBe('2018-06-01T00:00:00.000Z');
  });

  it('rejects non-admin imports and requires affirmative review before commit',async()=>{
    await expect(importPreview(fixture.db,{...actor,role:'judge'},{source:'archive',kind:'schools',rows:[school]})).rejects.toMatchObject({status:403});
    const preview=await previewSchool();
    await expect(commitImport(fixture.db,actor,{rows:preview.rows,reviewed:false})).rejects.toMatchObject({status:400});
  });

  it('never recreates a permanently deleted source record through preview or stale commit',async()=>{
    const initial=await previewSchool();
    const committed=await commit(initial);
    const entityId=committed.rows[0].entityId;
    await fixture.db.query("update import_rows set status='purged',entity_id=null,payload='{}' where id=$1",[initial.rows[0].id]);
    await fixture.db.query('delete from schools where id=$1',[entityId]);
    const repeated=await previewSchool();
    expect(repeated.rows[0].status).toBe('purged');
    expect(repeated.counts.purged).toBe(1);
    expect((await commit(initial)).errors).toBe(1);
    expect((await commit(repeated)).errors).toBe(1);
    const source=(await fixture.db.query('select status,payload,entity_id,preview_version from import_rows where id=$1',[initial.rows[0].id])).rows[0];
    expect(source.status).toBe('purged');
    expect(source.payload).toEqual({});
    expect(source.entity_id).toBeNull();
    expect(source.preview_version).toBe(initial.rows[0].version);
    expect((await fixture.db.query('select count(*)::int count from schools')).rows[0].count).toBe(0);
  });

  it('retains inaccessible historical file references as repair work without claiming completed submission',async()=>{
    await commit(await previewSchool());
    await commit(await importPreview(fixture.db,actor,{source:'archive',kind:'participations',editionId,rows:[{sourceId:'r1',name:'Alex',class:6,schoolSourceId:'school-1'}]}));
    const competitionId=randomUUID();
    await fixture.db.query("insert into competitions(id,edition_id,slug,title,guidelines,opens_at,closes_at,config) values($1,$2,'history','History','Historical guidelines','2018-01-01','2018-12-31',$3)",[competitionId,editionId,JSON.stringify({categories:[{id:'junior'}]})]);
    const preview=await importPreview(fixture.db,actor,{source:'archive',kind:'submissions',rows:[{sourceId:'entry-1',participationSourceId:'r1',competitionId,categoryId:'junior',submittedAt:'2018-10-01T12:00:00Z',fileReferences:['https://drive.google.com/file/d/historical-file/view'],answers:{title:'Historical work'}}]});
    const result=await commit(preview);expect(result.imported).toBe(1);expect(result.missingFiles).toBe(1);
    expect((await fixture.db.query('select state from submissions')).rows[0].state).toBe('draft');
    expect((await fixture.db.query('select status from historical_file_refs')).rows[0].status).toBe('missing');
    expect((await fixture.db.query('select count(*)::int count from submission_members')).rows[0].count).toBe(0);
    expect((await commit(preview)).duplicates).toBe(1);
  });

  it('creates repair work for every required original whose source reference is unknown',async()=>{
    await commit(await previewSchool());
    await commit(await importPreview(fixture.db,actor,{source:'archive',kind:'participations',editionId,rows:[{sourceId:'r1',name:'Alex',class:6,schoolSourceId:'school-1'}]}));
    const competitionId=randomUUID();
    await fixture.db.query("insert into competitions(id,edition_id,slug,title,guidelines,opens_at,closes_at,config) values($1,$2,'missing-originals','Missing originals','Historical guidelines','2018-01-01','2018-12-31',$3)",[competitionId,editionId,JSON.stringify({categories:[{id:'junior'}],files:{minCount:2,maxCount:2,maxBytes:100000,types:['application/pdf']}})]);
    const preview=await importPreview(fixture.db,actor,{source:'archive',kind:'submissions',rows:[{sourceId:'entry-missing',participationSourceId:'r1',competitionId,categoryId:'junior'}]});
    const result=await commit(preview);
    expect(result.imported).toBe(1);
    expect(result.missingFiles).toBe(2);
    const repairs=(await fixture.db.query('select id,source_url,status from historical_file_refs order by source_url')).rows;
    expect(repairs).toHaveLength(2);
    expect(repairs.map(row=>row.source_url)).toEqual(['unknown-source:1','unknown-source:2']);
    expect(repairs.every(row=>row.id&&row.status==='missing')).toBe(true);
    expect((await fixture.db.query('select retention_status from imported_submission_history')).rows[0].retention_status).toBe('missing');
    expect((await commit(preview)).duplicates).toBe(1);
    expect((await fixture.db.query('select count(*)::int count from historical_file_refs')).rows[0].count).toBe(2);
  });
});
