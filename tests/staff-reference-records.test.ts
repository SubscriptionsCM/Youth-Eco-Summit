import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {testDb} from './helpers/db';
import {adminList} from '../src/server/admin';
import {createFormRecord,getFormRecord} from '../src/server/portal-forms';
import {archiveWordPress} from '../src/server/wordpress-migration';
import {historicalEntry} from '../src/server/wordpress-projection';
import type {Actor} from '../src/server/core';

describe('staff access to retained reference forms',()=>{
 let fixture:Awaited<ReturnType<typeof testDb>>,owner:Actor,participant:Actor,submitted:string,draft:string,schoolId:string,historyId:string;
 beforeAll(async()=>{
  fixture=await testDb();owner={id:randomUUID(),role:'owner',contact:'owner@qa.example'};participant={id:randomUUID(),role:'participant',contact:'participant@qa.example'};
  for(const actor of [owner,participant])await fixture.db.query('INSERT INTO users(id,role,contact) VALUES($1,$2,$3)',[actor.id,actor.role,actor.contact]);
  schoolId=randomUUID();await fixture.db.query("INSERT INTO schools(id,reference,name,address,city,state,postal_code,status) VALUES($1,'YES-QA-STAFF','QA school','QA address','QA City','Delhi','110001','active')",[schoolId]);
  const created=await createFormRecord(fixture.db,null,{formKey:'school'});submitted=created.record.id;
  await fixture.db.query("UPDATE portal_form_records SET status='submitted',submitted_at=now(),school_id=$2,answers=$3,receipt=$4 WHERE id=$1",[submitted,schoolId,JSON.stringify({'text-1':'QA school','email-1':'qa@example.org'}),JSON.stringify({reference:created.record.reference,schoolStatus:'pending'})]);
  draft=(await createFormRecord(fixture.db,null,{formKey:'school'})).record.id;
  await archiveWordPress(fixture.db,{format:'yes-wordpress-export/v1',source:'https://staff-source.example',capturedAt:'2026-11-11T00:00:00Z',counts:{records:2,attachments:0},records:[{kind:'user',sourceId:'10',payload:{user_pass:'NEVER DISPLAY SOURCE PASSWORD HASH'}},{kind:'entry',sourceId:'20',payload:{form_id:12146,status:'active',meta:[{meta_key:'text-1',meta_value:'Retained QA query'},{meta_key:'email-1',meta_value:'qa@example.org'},{meta_key:'password-1',meta_value:'NEVER DISPLAY PASSWORD'}]}}],attachments:[]},{commit:true});
  historyId=(await fixture.db.query("SELECT id FROM wordpress_records WHERE kind='entry'")).rows[0].id;
 });
 afterAll(async()=>fixture?.close());
 it('lists submitted forms with bounded filters and no draft secrets or answer payloads',async()=>{
  const listed=await adminList(fixture.db,owner,'reference-forms',new URLSearchParams({id:submitted,formKey:'school',pageSize:'1'}));
  expect(listed.total).toBe(1);expect(listed.items).toHaveLength(1);expect(listed.items[0]).toMatchObject({id:submitted,form_key:'school',status:'submitted'});
  expect(listed.items[0]).not.toHaveProperty('draft_token_hash');expect(listed.items[0]).not.toHaveProperty('answers');expect(listed.items[0]).not.toHaveProperty('form_snapshot');
  expect((await adminList(fixture.db,owner,'reference-forms',new URLSearchParams({id:draft}))).total).toBe(0);
 });
 it('denies participant and judge access to staff form and archive collections',async()=>{
  for(const role of ['participant','judge'] as const)for(const resource of ['reference-forms','wordpress-history'])await expect(adminList(fixture.db,{...participant,role},resource,new URLSearchParams())).rejects.toMatchObject({status:403});
 });
 it('counts current reference submissions and preserved entries separately from operational judging records',async()=>{
  expect(await adminList(fixture.db,owner,'overview',new URLSearchParams())).toMatchObject({reference_submissions_all_editions:1,archived_source_entries_all_editions:1,reference_ready_files_all_editions:0});
 });
 it('returns current school status without altering its original receipt',async()=>{
  const record=await getFormRecord(fixture.db,owner,submitted);
  expect(record.current_school_status).toBe('active');expect(record.receipt.schoolStatus).toBe('pending');
 });
 it('lets staff discover archived entries without exposing archived users or raw metadata',async()=>{
  const listed=await adminList(fixture.db,owner,'wordpress-history',new URLSearchParams({q:'20',pageSize:'1'}));
  expect(listed.total).toBe(1);expect(listed.items).toHaveLength(1);expect(listed.items[0].id).toBe(historyId);
  expect(JSON.stringify(listed)).not.toContain('NEVER DISPLAY');expect(listed.items[0]).not.toHaveProperty('payload');
 });
 it('permits an active staff detail read while retaining participant ownership checks and password exclusion',async()=>{
  const detail=await historicalEntry(fixture.db,owner,historyId);expect(detail.fields.some(f=>f.value==='Retained QA query')).toBe(true);expect(JSON.stringify(detail)).not.toContain('NEVER DISPLAY');
  await expect(historicalEntry(fixture.db,participant,historyId)).rejects.toMatchObject({status:404});
 });
 it('rejects an inactive staff identity for both collections and archived details',async()=>{
  await fixture.db.query('UPDATE users SET active=false WHERE id=$1',[owner.id]);
  try{
   for(const resource of ['reference-forms','wordpress-history'])await expect(adminList(fixture.db,owner,resource,new URLSearchParams())).rejects.toMatchObject({status:401});
   await expect(historicalEntry(fixture.db,owner,historyId)).rejects.toMatchObject({status:401});
  }finally{await fixture.db.query('UPDATE users SET active=true WHERE id=$1',[owner.id]);}
 });
 it('shows only known scalar name and address parts from archived entries without rewriting source records',async()=>{
  await archiveWordPress(fixture.db,{format:'yes-wordpress-export/v1',source:'https://structured-source.example',capturedAt:'2026-11-11T00:00:00Z',counts:{records:1,attachments:0},records:[{kind:'entry',sourceId:'structured',payload:{form_id:12146,meta:[{meta_key:'name-3',meta_value:{'last-name':'Singh','first-name':'<b>Asha</b>',secret:'PRIVATE_SECRET','middle-name':{secret:'PRIVATE_NESTED'}}}]}}],attachments:[]},{commit:true});
  const original=(await fixture.db.query("SELECT * FROM wordpress_records WHERE source_id='structured'")).rows[0];
  const detail=await historicalEntry(fixture.db,owner,original.id);
  expect(detail.fields).toContainEqual({id:'name-3',type:'name',label:'Name',value:{'first-name':'Asha','last-name':'Singh'}});expect(JSON.stringify(detail)).not.toContain('PRIVATE_');
  expect((await fixture.db.query('SELECT checksum,payload FROM wordpress_records WHERE id=$1',[original.id])).rows[0]).toEqual({checksum:original.checksum,payload:original.payload});
  await archiveWordPress(fixture.db,{format:'yes-wordpress-export/v1',source:'https://structured-source.example',capturedAt:'2026-11-11T00:00:00Z',counts:{records:1,attachments:0},records:[{kind:'entry',sourceId:'address',payload:{form_id:9188,meta:[{meta_key:'address-1',meta_value:{street_address:'10 QA Road',city:'Delhi',zip:'110001',secret:'PRIVATE_SECRET',country:{private:'PRIVATE_NESTED'}}}]}}],attachments:[]},{commit:true});
  const address=(await fixture.db.query("SELECT id FROM wordpress_records WHERE source_id='address'")).rows[0];const addressDetail=await historicalEntry(fixture.db,owner,address.id);
  expect(addressDetail.fields).toContainEqual({id:'address-1',type:'address',label:'Address',value:{street_address:'10 QA Road',city:'Delhi',zip:'110001'}});expect(JSON.stringify(addressDetail)).not.toContain('PRIVATE_');
 });
 it('fails closed on a damaged archive checksum and never opens an archived user as an entry',async()=>{
  const original=(await fixture.db.query('SELECT checksum FROM wordpress_records WHERE id=$1',[historyId])).rows[0].checksum;
  await fixture.db.query('UPDATE wordpress_records SET checksum=$2 WHERE id=$1',[historyId,'b'.repeat(64)]);
  try{
   await expect(adminList(fixture.db,owner,'wordpress-history',new URLSearchParams({id:historyId}))).rejects.toMatchObject({status:409});
   await expect(historicalEntry(fixture.db,owner,historyId)).rejects.toMatchObject({status:409});
  }finally{await fixture.db.query('UPDATE wordpress_records SET checksum=$2 WHERE id=$1',[historyId,original]);}
  const user=(await fixture.db.query("SELECT id FROM wordpress_records WHERE kind='user'")).rows[0];
  await expect(historicalEntry(fixture.db,owner,user.id)).rejects.toMatchObject({status:404});
 });
});
