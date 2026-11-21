import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testDb } from './helpers/db';
import { archiveWordPress, fingerprint, type WordPressExport } from '../src/server/wordpress-migration';
import { historicalEntries } from '../src/server/wordpress-projection';
import { currentFormSnapshot, currentSourceSnapshot, importNativeLegacyAccounts, validateNativeAccounts } from '../scripts/lib/native-legacy-import';

const source='https://youthecosummit.com',hash='$wp$2y$10$'+'a'.repeat(53);
const account=(sourceUserId='123',email='participant@example.org',username='Participant')=>({
 sourceUserId,username,email,name:'Synthetic participant',passwordHash:hash,active:true,credentialFingerprint:'a'.repeat(64),
});
const envelope=(accounts=[account()])=>({format:'yes-native-accounts/v1' as const,source,capturedAt:'2026-11-21T00:00:00Z',accounts});

describe('native migration preserves source identity and private credentials',()=>{
 let fixture:Awaited<ReturnType<typeof testDb>>;
 beforeEach(async()=>{fixture=await testDb();});
 afterEach(async()=>{await fixture?.close();});
 it('previews without writes, imports once, and preserves participant archive access',async()=>{
  expect(await importNativeLegacyAccounts(fixture.db,envelope())).toMatchObject({sourceAccounts:1,ready:1,createdUsers:0,committed:false});
  expect((await fixture.db.query('SELECT id FROM users')).rows).toHaveLength(0);
  const result=await importNativeLegacyAccounts(fixture.db,envelope(),{commit:true});
  expect(result).toMatchObject({createdUsers:1,linkedSourceIdentities:1,credentialsImported:1});
  const [user]=(await fixture.db.query('SELECT * FROM users')).rows;
  expect(user.role).toBe('participant');expect(user.password_hash).toBe(hash);
  expect((await fixture.db.query('SELECT username FROM native_participant_accounts')).rows).toEqual([{username:'participant'}]);
  const records:WordPressExport['records']=[
   {kind:'user',sourceId:'123',payload:{ID:'123',user_email:account().email,roles:['administrator']}},
   {kind:'entry',sourceId:'456',payload:{form_id:48441,status:'active',meta:[{meta_key:'_yes_owner_user_id',meta_value:'123'}]}},
  ];
  await archiveWordPress(fixture.db,{format:'yes-wordpress-export/v1',source,capturedAt:envelope().capturedAt,records,attachments:[],counts:{records:2,attachments:0}},{commit:true});
  const history=await historicalEntries(fixture.db,{id:user.id,role:'participant',contact:user.contact});
  expect(history.items).toHaveLength(1);expect(history.items[0].sourceId).toBe('456');
  expect(await importNativeLegacyAccounts(fixture.db,envelope(),{commit:true})).toMatchObject({createdUsers:0,linkedSourceIdentities:0,credentialsImported:0,unchanged:1});
  expect((await fixture.db.query('SELECT id FROM users')).rows).toHaveLength(1);
 });
 it('reuses exact bound IDs, owners and contacts while preserving a changed native password',async()=>{
  const userId=randomUUID(),recordId=randomUUID();
  await fixture.db.query("INSERT INTO users(id,role,contact,name) VALUES($1,'participant',$2,'Existing native name')",[userId,account().email]);
  await fixture.db.query('INSERT INTO wordpress_account_identities(source,source_user_id,user_id,credential_fingerprint) VALUES($1,$2,$3,$4)',[source,'123',userId,'a'.repeat(64)]);
  await fixture.db.query("INSERT INTO portal_form_records(id,form_key,owner_id,reference) VALUES($1,'student',$2,'EXISTING-NATIVE-RECORD')",[recordId,userId]);
  await importNativeLegacyAccounts(fixture.db,envelope(),{commit:true});
  await fixture.db.query('UPDATE users SET password_hash=$2 WHERE id=$1',[userId,'scrypt:changed-native-password']);
  expect(await importNativeLegacyAccounts(fixture.db,envelope(),{commit:true})).toMatchObject({createdUsers:0,credentialsImported:0});
  expect((await fixture.db.query('SELECT id,name,password_hash FROM users')).rows).toEqual([{id:userId,name:'Existing native name',password_hash:'scrypt:changed-native-password'}]);
  expect((await fixture.db.query('SELECT owner_id FROM portal_form_records WHERE id=$1',[recordId])).rows[0].owner_id).toBe(userId);
 });
 it('never claims an existing contact by email or changes a privileged role',async()=>{
  const owner=randomUUID();
  await fixture.db.query("INSERT INTO users(id,role,contact,password_hash) VALUES($1,'owner',$2,'existing-owner-hash')",[owner,account().email]);
  await expect(importNativeLegacyAccounts(fixture.db,envelope(),{commit:true})).rejects.toMatchObject({issues:[{sourceUserId:'123',reason:'unlinked-native-contact'}]});
  expect((await fixture.db.query('SELECT id,role,password_hash FROM users')).rows).toEqual([{id:owner,role:'owner',password_hash:'existing-owner-hash'}]);
  expect((await fixture.db.query('SELECT * FROM native_participant_accounts')).rows).toHaveLength(0);
 });
 it('preserves explicitly reviewed source administrators as existing native staff without copying their source credentials',async()=>{
  const staffId=randomUUID(),nativeHash='scrypt-32768-8-3$'+'1'.repeat(32)+'$'+'2'.repeat(128);
  await fixture.db.query("INSERT INTO users(id,role,contact,password_hash,totp_secret) VALUES($1,'owner',$2,$3,'existing-encrypted-totp')",[staffId,account().email,nativeHash]);
  const payload={ID:'123',user_email:account().email,meta:[{meta_key:'wp_capabilities',meta_value:{administrator:true}}]};
  const mapping={format:'yes-native-staff-mappings/v1',source,mappings:[{sourceUserId:'123',userId:staffId,expectedRole:'owner',sourceChecksum:fingerprint(payload)}]};
  const options={staffMappings:mapping,sourceUsers:[{kind:'user' as const,sourceId:'123',payload}]};
  expect(await importNativeLegacyAccounts(fixture.db,envelope(),options)).toMatchObject({participantAccounts:0,staffAccounts:1,committed:false});
  expect((await fixture.db.query('SELECT * FROM wordpress_account_identities')).rows).toHaveLength(0);
  expect(await importNativeLegacyAccounts(fixture.db,envelope(),{...options,commit:true})).toMatchObject({createdUsers:0,linkedSourceIdentities:1,credentialsImported:0,preservedStaff:1});
  expect((await fixture.db.query('SELECT role,password_hash,totp_secret FROM users')).rows).toEqual([{role:'owner',password_hash:nativeHash,totp_secret:'existing-encrypted-totp'}]);
  expect((await fixture.db.query('SELECT * FROM native_participant_accounts')).rows).toHaveLength(0);
  expect((await fixture.db.query('SELECT user_id FROM wordpress_account_identities')).rows).toEqual([{user_id:staffId}]);
  expect(await importNativeLegacyAccounts(fixture.db,envelope(),{...options,commit:true})).toMatchObject({createdUsers:0,linkedSourceIdentities:0,preservedStaff:1});
 });
 it('fails closed for stale source evidence, wrong reviewed staff IDs or roles, and missing native TOTP',async()=>{
  const staffId=randomUUID(),nativeHash='scrypt-32768-8-3$'+'1'.repeat(32)+'$'+'2'.repeat(128);
  await fixture.db.query("INSERT INTO users(id,role,contact,password_hash,totp_secret) VALUES($1,'admin',$2,$3,'existing-encrypted-totp')",[staffId,account().email,nativeHash]);
  const payload={ID:'123',meta:[{meta_key:'wp_capabilities',meta_value:{administrator:true}}]},entry={sourceUserId:'123',userId:staffId,expectedRole:'admin',sourceChecksum:fingerprint(payload)};
  const attempt=(mapping:Record<string,unknown>,sourcePayload=payload)=>importNativeLegacyAccounts(fixture.db,envelope(),{commit:true,staffMappings:{format:'yes-native-staff-mappings/v1',source,mappings:[mapping]},sourceUsers:[{kind:'user',sourceId:'123',payload:sourcePayload}]});
  await expect(attempt({...entry,sourceChecksum:'b'.repeat(64)})).rejects.toMatchObject({issues:[{reason:'reviewed-staff-source-evidence'}]});
  await expect(attempt({...entry,userId:randomUUID()})).rejects.toMatchObject({issues:[{reason:'reviewed-staff-native-evidence'}]});
  await expect(attempt({...entry,expectedRole:'owner'})).rejects.toMatchObject({issues:[{reason:'reviewed-staff-native-evidence'}]});
  const subscriber={...payload,meta:[{meta_key:'wp_capabilities',meta_value:{administrator:false}}]};
  await expect(attempt({...entry,sourceChecksum:fingerprint(subscriber)},subscriber)).rejects.toMatchObject({issues:[{reason:'reviewed-staff-source-evidence'}]});
  await fixture.db.query('UPDATE users SET totp_secret=NULL WHERE id=$1',[staffId]);
  await expect(attempt(entry)).rejects.toMatchObject({issues:[{reason:'reviewed-staff-native-evidence'}]});
  expect((await fixture.db.query('SELECT * FROM wordpress_account_identities')).rows).toHaveLength(0);
  expect((await fixture.db.query('SELECT * FROM native_participant_accounts')).rows).toHaveLength(0);
  expect((await fixture.db.query('SELECT role,password_hash FROM users')).rows).toEqual([{role:'admin',password_hash:nativeHash}]);
 });
 it('preflights the whole batch before creating any user on a later collision',async()=>{
  await fixture.db.query("INSERT INTO users(id,role,contact) VALUES($1,'owner','second@example.org')",[randomUUID()]);
  await expect(importNativeLegacyAccounts(fixture.db,envelope([account(),account('124','second@example.org','second')]),{commit:true})).rejects.toThrow(/reconciliation/i);
  expect((await fixture.db.query('SELECT id FROM users')).rows).toHaveLength(1);
  expect((await fixture.db.query('SELECT * FROM wordpress_account_identities')).rows).toHaveLength(0);
 });
 it('rejects changed source credentials after a native import rather than silently replacing a native password',async()=>{
  await importNativeLegacyAccounts(fixture.db,envelope(),{commit:true});
  const changed={...account(),passwordHash:'$wp$2y$10$'+'b'.repeat(53),credentialFingerprint:'b'.repeat(64)};
  await expect(importNativeLegacyAccounts(fixture.db,envelope([changed]),{commit:true})).rejects.toMatchObject({issues:[{sourceUserId:'123',reason:'source-credentials-changed-after-native-import'}]});
  expect((await fixture.db.query('SELECT password_hash FROM users')).rows[0].password_hash).toBe(hash);
 });
 it('reuses an explicitly verified archive claim without merging unrelated contacts',async()=>{
  const userId=randomUUID(),ownerId=randomUUID(),authId=randomUUID();
  await fixture.db.query("INSERT INTO users(id,role,contact) VALUES($1,'participant',$2),($3,'owner','owner@example.org')",[userId,account().email,ownerId]);
  await fixture.db.query('INSERT INTO supabase_identities(auth_user_id,user_id,verified_contact) VALUES($1,$2,$3)',[authId,userId,account().email]);
  const payload={ID:'123',user_email:account().email};
  await archiveWordPress(fixture.db,{format:'yes-wordpress-export/v1',source,capturedAt:envelope().capturedAt,records:[{kind:'user',sourceId:'123',payload}],attachments:[],counts:{records:1,attachments:0}},{commit:true});
  const record=(await fixture.db.query('SELECT id FROM wordpress_records')).rows[0];
  await fixture.db.query('INSERT INTO wordpress_user_links(record_id,user_id,auth_user_id,source_checksum,linked_by) VALUES($1,$2,$3,$4,$5)',[record.id,userId,authId,fingerprint(payload),ownerId]);
  expect(await importNativeLegacyAccounts(fixture.db,envelope(),{commit:true})).toMatchObject({createdUsers:0,linkedSourceIdentities:1,credentialsImported:1});
  expect((await fixture.db.query('SELECT user_id FROM wordpress_account_identities')).rows[0].user_id).toBe(userId);
 });
 it('preserves two distinct legacy principals when one username equals another email',async()=>{
  const data=envelope([account('99','first@example.org','first-user'),account('205','second@example.org','first@example.org')]);
  expect(await importNativeLegacyAccounts(fixture.db,data,{commit:true})).toMatchObject({createdUsers:2,credentialsImported:2});
  const bindings=(await fixture.db.query('SELECT source_user_id,user_id FROM wordpress_account_identities ORDER BY source_user_id')).rows;
  expect(bindings).toHaveLength(2);expect(new Set(bindings.map(binding=>binding.user_id)).size).toBe(2);
  expect((await fixture.db.query('SELECT contact FROM users ORDER BY contact')).rows).toEqual([{contact:'first@example.org'},{contact:'second@example.org'}]);
  expect(await importNativeLegacyAccounts(fixture.db,data,{commit:true})).toMatchObject({createdUsers:0,credentialsImported:0,unchanged:2});
 });
 it('rejects duplicate identities and unsupported password hashes',()=>{
  expect(()=>validateNativeAccounts(envelope([account(),account('123','other@example.org','other')]))).toThrow(/duplicate/i);
  expect(()=>validateNativeAccounts(envelope([{...account(),passwordHash:'plaintext'}]))).toThrow();
 });
});

it('records exact current form checksums even when source configuration reverts to its baseline',()=>{
 const original={kind:'form' as const,sourceId:'10',payload:{definition:{settings:{label:'original'}}}};
 const changed={...original,payload:{definition:{settings:{label:'changed'}}}};
 const data=(record:typeof original):WordPressExport=>({format:'yes-wordpress-export/v1',source,capturedAt:envelope().capturedAt,records:[record],attachments:[],counts:{records:1,attachments:0}});
 expect(currentFormSnapshot(data(changed)).payload.forms).toEqual({'10':fingerprint(changed.payload)});
 expect(currentFormSnapshot(data(original)).payload.forms).toEqual({'10':fingerprint(original.payload)});
});

it('pins exact current payloads for all source kinds without selecting the newest retained version',()=>{
 const records:WordPressExport['records']=[
  {kind:'user',sourceId:'1',payload:{ID:'1',user_pass:'original'}},
  {kind:'entry',sourceId:'2',payload:{form_id:'3'}},
  {kind:'form',sourceId:'3',payload:{definition:{}}},
  {kind:'school',sourceId:'SCHOOL-4',payload:{reference:'SCHOOL-4',legacy_ids:['OLD-4']}},
  {kind:'option',sourceId:'historical-option',payload:{value:'original'}},
  {kind:'post',sourceId:'legacy-post:5',payload:{post_title:'Original'}},
 ];
 const data:WordPressExport={format:'yes-wordpress-export/v1',source,capturedAt:envelope().capturedAt,records,attachments:[],counts:{records:records.length,attachments:0}};
 const snapshot=currentSourceSnapshot(data);
 expect(snapshot.sourceId).toBe('native-current-records:'+data.capturedAt);
 expect(snapshot.payload).toEqual({format:'yes-native-source-snapshot/v1',capturedAt:data.capturedAt,records:Object.fromEntries(records.map(record=>[record.kind,{[record.sourceId]:fingerprint(record.payload)}]))});
});
