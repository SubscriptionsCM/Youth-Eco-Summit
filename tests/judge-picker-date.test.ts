import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {testDb} from './helpers/db';
import {listJudgingEntries} from '../src/server/judge-portal';
import {referenceForms} from '../src/domain/wordpress-forms';
import {fingerprint} from '../src/server/wordpress-migration';
import type {Actor} from '../src/server/core';

describe('original WordPress picker dates',()=>{
 let fixture:Awaited<ReturnType<typeof testDb>>,owner:Actor,before:any[],nativeId:string;
 const form=referenceForms.find(f=>f.key==='open-letter')!;
 beforeAll(async()=>{
  fixture=await testDb();owner={id:randomUUID(),role:'owner'};await fixture.db.query("INSERT INTO users(id,role,contact) VALUES($1,'owner','date-owner@qa.example')",[owner.id]);
  for(const [sourceId,created,captured] of [['early','2026-11-13 09:45:00','2026-11-16T10:00:00Z'],['late','2026-11-15 23:10:00','2026-11-16T01:00:00Z'],['missing',null,'2026-11-16T11:00:00Z'],['blank','   ','2026-11-16T12:00:00Z'],['wrong-type',{unexpected:true},'2026-11-16T13:00:00Z']] as const){
   const payload={form_id:form.id,status:'active',...(created===null?{}:{date_created:created}),meta:[]};
   await fixture.db.query("INSERT INTO wordpress_records(id,source,kind,source_id,payload,checksum,captured_at) VALUES($1,'https://source.qa','entry',$2,$3,$4,$5)",[randomUUID(),sourceId,JSON.stringify(payload),fingerprint(payload),captured]);
  }
  nativeId=randomUUID();await fixture.db.query("INSERT INTO portal_form_records(id,form_key,reference,status,submitted_at) VALUES($1,'open-letter','QA-DATE-NATIVE','submitted','2026-11-14T06:30:00Z')",[nativeId]);
  before=(await fixture.db.query('SELECT * FROM wordpress_records ORDER BY id')).rows;
 });
 afterAll(async()=>fixture?.close());
 const listing=()=>listJudgingEntries(fixture.db,owner,new URLSearchParams({source:'wordpress',formKey:form.key}));
 it('returns original source submission time separately from capture time',async()=>{
  const items=(await listing()).items,early=items.find(r=>r.reference==='WP-early')!;
  expect(early.submitted_at).toBe('2026-11-13 09:45:00');expect(new Date(early.imported_at).toISOString()).toBe('2026-11-16T10:00:00.000Z');
 });
 it('sorts by original submission date with absent dates last',async()=>{
  const items=(await listing()).items;expect(items.slice(0,2).map(r=>r.reference)).toEqual(['WP-late','WP-early']);
 });
 it('does not substitute import time for missing, blank or non-string dates',async()=>{
  const items=(await listing()).items;for(const ref of ['missing','blank','wrong-type'])expect(items.find(r=>r.reference==='WP-'+ref)?.submitted_at).toBeNull();
 });
 it('keeps native submission timestamps unchanged',async()=>{
  const items=(await listJudgingEntries(fixture.db,owner,new URLSearchParams({source:'portal',formKey:form.key}))).items;
  expect(items[0].id).toBe(nativeId);expect(new Date(items[0].submitted_at).toISOString()).toBe('2026-11-14T06:30:00.000Z');
 });
 it('does not update any archived row or checksum while projecting picker dates',async()=>{
  await listing();expect((await fixture.db.query('SELECT * FROM wordpress_records ORDER BY id')).rows).toEqual(before);
 });
});
