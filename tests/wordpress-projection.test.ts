import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { testDb } from './helpers/db';
import { archiveWordPress } from '../src/server/wordpress-migration';
import { projectWordPressSchools, linkWordPressUser, historicalEntries, historicalEntry, historicalAttachment } from '../src/server/wordpress-projection';
import type { Actor } from '../src/server/core';

describe('operational WordPress identity migration',()=>{
 let fixture:Awaited<ReturnType<typeof testDb>>,owner:Actor,participant:Actor,authId:string;
 beforeEach(async()=>{fixture=await testDb();owner={id:randomUUID(),role:'owner',contact:'owner@example.org'};participant={id:randomUUID(),role:'participant',contact:'verified@example.org'};authId=randomUUID();for(const actor of [owner,participant])await fixture.db.query('INSERT INTO users(id,role,contact) VALUES($1,$2,$3)',[actor.id,actor.role,actor.contact]);await fixture.db.query('INSERT INTO supabase_identities(auth_user_id,user_id,verified_contact) VALUES($1,$2,$3)',[authId,participant.id,participant.contact]);});
 afterEach(async()=>fixture?.close());
 const source='https://source.example';
 async function archive(records:Record<string,any>[]){await archiveWordPress(fixture.db,{format:'yes-wordpress-export/v1',source,capturedAt:'2026-11-04T10:00:00Z',counts:{records:records.length,attachments:0},records,attachments:[]},{commit:true});}
 const school=(reference='YES-SCH-001',aliases=['YEC-EDU-001'])=>({kind:'school',sourceId:reference,payload:{reference,name:'Same Name School',address:'North branch',city:'Delhi',state:'Delhi',postal_code:'110001',legacy_ids:aliases}});
 it('previews without writing and imports permanent IDs and aliases idempotently without merging names',async()=>{
  await archive([school(),{...school('YES-SCH-002',[]),payload:{...school('YES-SCH-002',[]).payload,address:'South branch'}}]);
  expect((await projectWordPressSchools(fixture.db,source)).created).toBe(0);
  expect((await fixture.db.query('SELECT * FROM schools')).rows).toHaveLength(0);
  expect((await projectWordPressSchools(fixture.db,source,{commit:true})).created).toBe(2);
  expect((await projectWordPressSchools(fixture.db,source,{commit:true})).created).toBe(0);
  expect((await fixture.db.query('SELECT * FROM schools')).rows).toHaveLength(2);
  expect((await fixture.db.query("SELECT school_id FROM school_identifiers WHERE reference='YEC-EDU-001'")).rows[0].school_id).toBe((await fixture.db.query("SELECT id FROM schools WHERE reference='YES-SCH-001'")).rows[0].id);
 });
 it('retains existing target corrections and inactive status when an explicit source ID already matches',async()=>{
  const existing=randomUUID();await fixture.db.query("INSERT INTO schools(id,reference,name,address,city,state,postal_code,status) VALUES($1,'YES-SCH-001','Corrected name','Corrected address','Delhi','Delhi','110001','inactive')",[existing]);
  await archive([school()]);await projectWordPressSchools(fixture.db,source,{commit:true});
  const saved=(await fixture.db.query('SELECT * FROM schools WHERE id=$1',[existing])).rows[0];expect(saved.name).toBe('Corrected name');expect(saved.status).toBe('inactive');
 });
 it('rolls back the full school batch on a conflicting alias rather than merging records',async()=>{
  for(const reference of ['YES-SCH-001','YEC-EDU-001'])await fixture.db.query("INSERT INTO schools(id,reference,name,address,city,state,postal_code) VALUES($1,$2,'Existing school',$3,'Delhi','Delhi','110001')",[randomUUID(),reference,`Existing address ${reference}`]);
  await archive([school('YES-SCH-NEW',[]),school()]);
  await expect(projectWordPressSchools(fixture.db,source,{commit:true})).rejects.toThrow(/conflict/i);
  expect((await fixture.db.query("SELECT id FROM schools WHERE reference='YES-SCH-NEW'")).rows).toHaveLength(0);
 });
 it('rejects a canonical reference claimed as another source school alias in preview and commit',async()=>{
  const first=school('YES-SCH-AAA',['YES-SCH-BBB']),second=school('YES-SCH-BBB',[]);
  second.payload.name='Different School';second.payload.address='Different branch';
  await archive([first,second]);
  await expect(projectWordPressSchools(fixture.db,source)).rejects.toThrow(/conflict/i);
  await expect(projectWordPressSchools(fixture.db,source,{commit:true})).rejects.toThrow(/conflict/i);
  expect((await fixture.db.query('SELECT * FROM schools')).rows).toHaveLength(0);
  expect((await fixture.db.query('SELECT * FROM school_identifiers')).rows).toHaveLength(0);
  expect((await fixture.db.query('SELECT * FROM wordpress_school_links')).rows).toHaveLength(0);
 });
 it('rejects a later canonical claim against a previously projected school alias without changing the first school',async()=>{
  await archive([school('YES-SCH-AAA',['YES-SCH-BBB'])]);
  await projectWordPressSchools(fixture.db,source,{commit:true});
  expect((await projectWordPressSchools(fixture.db,source,{commit:true})).unchanged).toBe(1);
  const second=school('YES-SCH-BBB',[]);second.payload.name='Different School';second.payload.address='Different branch';
  await archive([second]);
  await expect(projectWordPressSchools(fixture.db,source)).rejects.toThrow(/conflict/i);
  await expect(projectWordPressSchools(fixture.db,source,{commit:true})).rejects.toThrow(/conflict/i);
  expect((await fixture.db.query('SELECT reference FROM schools')).rows).toEqual([{reference:'YES-SCH-AAA'}]);
  expect((await fixture.db.query('SELECT * FROM wordpress_school_links')).rows).toHaveLength(1);
 });
 it('rejects canonical claims against school aliases projected from another origin',async()=>{
  await archive([school('YES-SCH-AAA',['YES-SCH-BBB'])]);await projectWordPressSchools(fixture.db,source,{commit:true});
  // Retained source ownership must survive an accidentally removed directory alias.
  await fixture.db.query("DELETE FROM school_identifiers WHERE reference='YES-SCH-BBB'");
  const otherSource='https://other-source.example',second=school('YES-SCH-BBB',[]);second.payload.name='Different School';second.payload.address='Different branch';
  await archiveWordPress(fixture.db,{format:'yes-wordpress-export/v1',source:otherSource,capturedAt:'2026-11-04T10:00:00Z',counts:{records:1,attachments:0},records:[second],attachments:[]},{commit:true});
  await expect(projectWordPressSchools(fixture.db,otherSource)).rejects.toThrow(/conflict/i);
  await expect(projectWordPressSchools(fixture.db,otherSource,{commit:true})).rejects.toThrow(/conflict/i);
  expect((await fixture.db.query('SELECT * FROM schools')).rows).toHaveLength(1);
  expect((await fixture.db.query('SELECT * FROM wordpress_school_links')).rows).toHaveLength(1);
 });
 it('rejects shared aliases claimed by different source schools',async()=>{
  const first=school('YES-SCH-AAA',['YEC-SHARED']),second=school('YES-SCH-BBB',['YEC-SHARED']);second.payload.name='Different School';second.payload.address='Different branch';
  await archive([first,second]);
  await expect(projectWordPressSchools(fixture.db,source)).rejects.toThrow(/conflict/i);
  await expect(projectWordPressSchools(fixture.db,source,{commit:true})).rejects.toThrow(/conflict/i);
  expect((await fixture.db.query('SELECT * FROM schools')).rows).toHaveLength(0);
 });
 async function history(){await archive([{kind:'user',sourceId:'123',payload:{ID:'123',user_email:'verified@example.org',roles:['administrator']}},{kind:'entry',sourceId:'456',payload:{form_id:'48542',status:'active',date_created:'2026-10-05 10:00:00',meta:[{meta_key:'_yes_entry_account_id',meta_value:'123'},{meta_key:'text-yes-name',meta_value:'Synthetic Student'},{meta_key:'password-1',meta_value:'must-never-return'},{meta_key:'_forminator_user_ip',meta_value:'private-metadata'}]}}]);}
 it('links only an explicit source user to a matching verified participant, without inheriting staff roles',async()=>{
  await history();
  await expect(linkWordPressUser(fixture.db,participant,{source,sourceId:'123',authUserId:authId})).rejects.toMatchObject({status:403});
  await fixture.db.query("UPDATE supabase_identities SET verified_contact='different@example.org' WHERE auth_user_id=$1",[authId]);
  await expect(linkWordPressUser(fixture.db,owner,{source,sourceId:'123',authUserId:authId})).rejects.toMatchObject({status:422});
  await fixture.db.query('UPDATE supabase_identities SET verified_contact=$2 WHERE auth_user_id=$1',[authId,participant.contact]);
  await linkWordPressUser(fixture.db,owner,{source,sourceId:'123',authUserId:authId});
  await linkWordPressUser(fixture.db,owner,{source,sourceId:'123',authUserId:authId});
  expect((await fixture.db.query('SELECT role FROM users WHERE id=$1',[participant.id])).rows[0].role).toBe('participant');
  expect((await fixture.db.query('SELECT * FROM wordpress_user_links')).rows).toHaveLength(1);
 });
 it('shows historical entries only after verified source ownership is linked and never returns source passwords or IP metadata',async()=>{
  await history();expect((await historicalEntries(fixture.db,participant)).items).toHaveLength(0);
  const entryId=(await fixture.db.query("SELECT id FROM wordpress_records WHERE kind='entry'")).rows[0].id;
  await expect(historicalEntry(fixture.db,participant,entryId)).rejects.toMatchObject({status:404});
  await linkWordPressUser(fixture.db,owner,{source,sourceId:'123',authUserId:authId});
  expect((await historicalEntries(fixture.db,participant)).items).toHaveLength(1);
  const entry=await historicalEntry(fixture.db,participant,entryId);
  expect(entry.fields.some((field:any)=>field.value==='Synthetic Student')).toBe(true);
  expect(JSON.stringify(entry)).not.toMatch(/must-never-return|private-metadata/);
 });
 it('rejects a revoked owner even when their in-memory actor still says owner',async()=>{
  await history();await fixture.db.query('UPDATE users SET active=false WHERE id=$1',[owner.id]);
  await expect(linkWordPressUser(fixture.db,owner,{source,sourceId:'123',authUserId:authId})).rejects.toMatchObject({status:403});
  expect((await fixture.db.query('SELECT * FROM wordpress_user_links')).rows).toHaveLength(0);
 });
 it('denies conflicting ownership pointers and never treats a matching email as entry ownership',async()=>{
  await archive([{kind:'user',sourceId:'123',payload:{user_email:participant.contact}},{kind:'entry',sourceId:'conflict',payload:{form_id:'48542',meta:[{meta_key:'_yes_entry_account_id',meta_value:'123'},{meta_key:'_yes_owner_user_id',meta_value:'999'},{meta_key:'email-1',meta_value:participant.contact}]}},{kind:'entry',sourceId:'email-only',payload:{form_id:'48542',meta:[{meta_key:'email-1',meta_value:participant.contact}]}}]);
  await linkWordPressUser(fixture.db,owner,{source,sourceId:'123',authUserId:authId});
  expect((await historicalEntries(fixture.db,participant)).items).toHaveLength(0);
  const entryId=(await fixture.db.query("SELECT id FROM wordpress_records WHERE source_id='conflict'")).rows[0].id;
  await expect(historicalEntry(fixture.db,participant,entryId)).rejects.toMatchObject({status:404});
 });
 it('refuses changed archived school or user payloads when their source checksum no longer verifies',async()=>{
  await archive([school(),{kind:'user',sourceId:'123',payload:{user_email:participant.contact}}]);
  await fixture.db.query("UPDATE wordpress_records SET payload=payload || '{\"name\":\"Tampered\"}'::jsonb WHERE kind IN ('school','user')");
  await expect(projectWordPressSchools(fixture.db,source,{commit:true})).rejects.toThrow(/checksum/i);
  await expect(linkWordPressUser(fixture.db,owner,{source,sourceId:'123',authUserId:authId})).rejects.toThrow(/checksum/i);
  expect((await fixture.db.query('SELECT * FROM schools')).rows).toHaveLength(0);
 });
 it('denies cross-origin entries and tampered history after a valid explicit link',async()=>{
  await history();await linkWordPressUser(fixture.db,owner,{source,sourceId:'123',authUserId:authId});
  await archiveWordPress(fixture.db,{format:'yes-wordpress-export/v1',source:'https://other.example',capturedAt:'2026-11-04T10:00:00Z',counts:{records:1,attachments:0},records:[{kind:'entry',sourceId:'foreign',payload:{form_id:'48542',meta:[{meta_key:'_yes_owner_user_id',meta_value:'123'}]}}],attachments:[]},{commit:true});
  expect((await historicalEntries(fixture.db,participant)).items).toHaveLength(1);
  await fixture.db.query("UPDATE wordpress_records SET payload=payload || '{\"status\":\"tampered\"}'::jsonb WHERE kind='entry' AND source=$1",[source]);
  expect((await historicalEntries(fixture.db,participant)).items).toHaveLength(0);
 });
 it('never exposes non-allowlisted fields, nested private values, hidden fields, or upload paths',async()=>{
  await archive([{kind:'user',sourceId:'123',payload:{user_email:participant.contact}},{kind:'entry',sourceId:'safe',payload:{form_id:'48542',meta:[{meta_key:'_yes_owner_user_id',meta_value:'123'},{meta_key:'text-yes-name',meta_value:'<b>Synthetic Student</b>'},{meta_key:'text-yes-title',meta_value:{private:'nested-secret'}},{meta_key:'hidden-yes-submitter',meta_value:'hidden-secret'},{meta_key:'upload-yes-file',meta_value:'/private/file'},{meta_key:'unknown-field',meta_value:'unknown-secret'}]}}]);
  await linkWordPressUser(fixture.db,owner,{source,sourceId:'123',authUserId:authId});
  const entryId=(await fixture.db.query("SELECT id FROM wordpress_records WHERE kind='entry'")).rows[0].id;
  const entry=await historicalEntry(fixture.db,participant,entryId);
  expect(entry.fields.some((field:any)=>field.value==='Synthetic Student')).toBe(true);
  expect(JSON.stringify(entry)).not.toMatch(/<b>|nested-secret|hidden-secret|unknown-secret|\/private\/file/);
 });
 it('rejects reassigning a source user or using a staff target and revokes history for disabled participants',async()=>{
  await history();await linkWordPressUser(fixture.db,owner,{source,sourceId:'123',authUserId:authId});
  const other=randomUUID(),otherAuth=randomUUID();
  await fixture.db.query("INSERT INTO users(id,role,contact) VALUES($1,'participant','other@example.org')",[other]);
  await fixture.db.query('INSERT INTO supabase_identities(auth_user_id,user_id,verified_contact) VALUES($1,$2,$3)',[otherAuth,other,participant.contact]);
  await expect(linkWordPressUser(fixture.db,owner,{source,sourceId:'123',authUserId:otherAuth})).rejects.toMatchObject({status:409});
  await fixture.db.query("UPDATE users SET role='admin' WHERE id=$1",[participant.id]);
  await expect(linkWordPressUser(fixture.db,owner,{source,sourceId:'123',authUserId:authId})).rejects.toMatchObject({status:422});
  await fixture.db.query("UPDATE users SET role='participant',active=false WHERE id=$1",[participant.id]);
  expect((await historicalEntries(fixture.db,participant)).items).toHaveLength(0);
 });
 it('authorizes archived file access through the same verified entry owner and hides private storage keys in history',async()=>{
  await history();await linkWordPressUser(fixture.db,owner,{source,sourceId:'123',authUserId:authId});
  const entryId=(await fixture.db.query("SELECT id FROM wordpress_records WHERE kind='entry'")).rows[0].id;
  const fileId=randomUUID(),storageKey=`wordpress/${'a'.repeat(64)}/${'b'.repeat(64)}`;
  await fixture.db.query("INSERT INTO wordpress_attachments(id,source,source_id,entry_record_id,filename,mime_type,byte_size,checksum,storage_key,verified_at) VALUES($1,$2,'file-1',$3,'synthetic.txt','text/plain',10,$4,$5,now())",[fileId,source,entryId,'b'.repeat(64),storageKey]);
  const entry=await historicalEntry(fixture.db,participant,entryId);
  expect(entry.attachments).toEqual([{id:fileId,filename:'synthetic.txt',mimeType:'text/plain',bytes:10}]);
  expect(JSON.stringify(entry)).not.toContain(storageKey);
  expect((await historicalAttachment(fixture.db,participant,fileId)).storage_key).toBe(storageKey);
  await expect(historicalAttachment(fixture.db,{id:randomUUID(),role:'participant'},fileId)).rejects.toMatchObject({status:404});
  await fixture.db.query("UPDATE wordpress_attachments SET source='https://foreign.example' WHERE id=$1",[fileId]);
  await expect(historicalAttachment(fixture.db,participant,fileId)).rejects.toMatchObject({status:404});
 });
 it('requires the current participant contact to continue matching their verified source email',async()=>{
  await history();await linkWordPressUser(fixture.db,owner,{source,sourceId:'123',authUserId:authId});
  await fixture.db.query("UPDATE users SET contact='changed@example.org' WHERE id=$1",[participant.id]);
  expect((await historicalEntries(fixture.db,participant)).items).toHaveLength(0);
  await expect(linkWordPressUser(fixture.db,owner,{source,sourceId:'123',authUserId:authId})).rejects.toMatchObject({status:422});
 });
 it('rejects school records whose explicit canonical reference disagrees with their source identity',async()=>{
  await archive([{...school(),sourceId:'YES-SCH-OTHER'}]);
  await expect(projectWordPressSchools(fixture.db,source,{commit:true})).rejects.toMatchObject({status:409});
  expect((await fixture.db.query('SELECT * FROM schools')).rows).toHaveLength(0);
 });
 it('rolls back created schools and links if a later database identity conflict rejects the batch',async()=>{
  await archive([school('YES-SCH-001',[]),school('YES-SCH-002',[])]);
  await expect(projectWordPressSchools(fixture.db,source,{commit:true})).rejects.toThrow(/school_exact_identity/);
  expect((await fixture.db.query('SELECT * FROM schools')).rows).toHaveLength(0);
  expect((await fixture.db.query('SELECT * FROM school_identifiers')).rows).toHaveLength(0);
  expect((await fixture.db.query('SELECT * FROM wordpress_school_links')).rows).toHaveLength(0);
 });
 it('blocks a second archived identity claim from the same source without replacing the original link',async()=>{
  await history();await archive([{kind:'user',sourceId:'different-user',payload:{user_email:participant.contact}}]);
  await linkWordPressUser(fixture.db,owner,{source,sourceId:'123',authUserId:authId});
  await expect(linkWordPressUser(fixture.db,owner,{source,sourceId:'different-user',authUserId:authId})).rejects.toMatchObject({status:409});
  expect((await fixture.db.query('SELECT * FROM wordpress_user_links')).rows).toHaveLength(1);
 });
 it('enables row-level security on both additive identity link tables',async()=>{
  const {rows}=await fixture.db.query("SELECT relname,relrowsecurity FROM pg_class WHERE relname IN ('wordpress_school_links','wordpress_user_links') ORDER BY relname");
  expect(rows).toEqual([{relname:'wordpress_school_links',relrowsecurity:true},{relname:'wordpress_user_links',relrowsecurity:true}]);
 });
});
