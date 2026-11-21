import {expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {fingerprint} from '../src/server/wordpress-migration';
import {backfillParticipantKinds,planParticipantKinds,type ParticipantKindBackfillInput} from '../src/server/participant-kind-backfill';
import {testDb} from './helpers/db';

const source='https://source.example.test',userId=randomUUID();
const empty=():ParticipantKindBackfillInput=>({users:[{id:userId,participant_kind:'unclassified'}],bindings:[{user_id:userId,source,source_user_id:'123'}],records:[],versions:[],signups:[],legacySignups:[],audits:[],contacts:[{user_id:userId,verified_contact:'account@example.test'}]});
const record=(payload:Record<string,unknown>,kind='entry',sourceId='1')=>({id:randomUUID(),source,source_id:sourceId,kind,payload,checksum:fingerprint(payload)});
const registration=(formId:string,email='account@example.test')=>({form_id:formId,status:'active',draft_id:null,meta:[{meta_key:'email-1',meta_value:email}]});

it('uses consumed original signup form and self-authored registration audit, not competition submitter role',()=>{
 const input=empty();input.signups=[{user_id:userId,form_key:'student'}];input.audits=[{actor_id:userId,entity_id:userId,detail:{formKey:'student'}}];
 input.records=[record({form_id:'48548',status:'active',meta:[{meta_key:'_yes_owner_user_id',meta_value:'123'},{meta_key:'hidden-yes-submitter',meta_value:'educator'}]})];
 expect(planParticipantKinds(input).planned).toEqual([{userId,kind:'student',sources:['native-signup','native-signup-audit']}]);
});
it('matches legacy signup through one exact source-bound registration nonce, without contact or name matching',()=>{
 const input=empty(),nonce=randomUUID();input.records=[record({ID:'123',meta:[{meta_key:'_yes_next_registration_nonce',meta_value:nonce}]},'user','123')];input.legacySignups=[{registration_nonce:nonce,form_key:'teacher'}];
 expect(planParticipantKinds(input).planned[0].kind).toBe('educator');
 input.bindings[0].source='https://other.example.test';expect(planParticipantKinds(input).planned).toEqual([]);
});
it('only enables optional current own-registration email history when requested and unambiguous',()=>{
 const input=empty();input.records=[record(registration('48441','  ACCOUNT@example.test  '))];
 expect(planParticipantKinds(input).report.unclassified).toBe(1);
 expect(planParticipantKinds(input,{registrationHistory:true}).planned[0].kind).toBe('student');
 input.records.push(record(registration('48437')));
 expect(planParticipantKinds(input,{registrationHistory:true}).report).toMatchObject({ready:0,unclassified:1,conflicting:1});
});
it('never upgrades a student because they previously owned a school registration',()=>{
 const input=empty();input.records=[record(registration('48441')),record({form_id:'9188',status:'active',meta:[{meta_key:'email-1',meta_value:'account@example.test'},{meta_key:'_yes_owner_user_id',meta_value:'123'}]})];
 expect(planParticipantKinds(input).report).toMatchObject({ready:0,unclassified:1});
 expect(planParticipantKinds(input,{registrationHistory:true}).planned).toEqual([{userId,kind:'student',sources:['verified-registration-history']}]);
 input.signups=[{user_id:userId,form_key:'school'}];input.records=[];
 expect(planParticipantKinds(input).planned[0].kind).toBe('school');
});
it('excludes draft/spam, guardian/contact-only, archived old-email and unrelated form matches',()=>{
 const input=empty();input.records=[record({...registration('48441'),draft_id:'saved-draft'}),record({...registration('48441'),is_draft:true}),record({...registration('48437'),is_spam:'1'}),record(registration('28713')),record({form_id:'48441',status:'active',meta:[{meta_key:'email-yes-guardian-1',meta_value:'account@example.test'}]}),record(registration('toString'))];
 expect(planParticipantKinds(input,{registrationHistory:true}).report.ready).toBe(0);
});
it('requires one verified account match and refuses conflicting explicit source owner pointers',()=>{
 const input=empty(),other=randomUUID();input.users.push({id:other,participant_kind:'unclassified'});input.contacts!.push({user_id:other,verified_contact:'account@example.test'});input.records=[record(registration('48441'))];
 expect(planParticipantKinds(input,{registrationHistory:true}).report.ready).toBe(0);
 input.contacts!.pop();input.records=[record({...registration('48441'),meta:[...registration('48441').meta,{meta_key:'_yes_owner_user_id',meta_value:'456'}]})];
 expect(planParticipantKinds(input,{registrationHistory:true}).report.ready).toBe(0);
});
it('holds conflicting original/history kinds and preserves an already assigned kind',()=>{
 const input=empty();input.signups=[{user_id:userId,form_key:'student'}];input.records=[record(registration('48437'))];
 expect(planParticipantKinds(input,{registrationHistory:true}).report).toMatchObject({ready:0,conflicting:1,unclassified:1});
 input.users[0].participant_kind='school';expect(planParticipantKinds(input,{registrationHistory:true}).report).toMatchObject({ready:0,alreadyClassified:1});
});
it('requires valid archive/version checksums and retains conflicting verified versions for review',()=>{
 const input=empty(),baseline=record(registration('48441'));
 input.records=[{...baseline,checksum:'0'.repeat(64)}];expect(planParticipantKinds(input,{registrationHistory:true}).report).toMatchObject({ready:0,invalidArchives:1});
 input.records=[baseline];input.versions=[{...baseline,payload:registration('48437'),checksum:fingerprint(registration('48437')),baseline_checksum:baseline.checksum}];
 expect(planParticipantKinds(input,{registrationHistory:true}).report).toMatchObject({ready:0,conflicting:1});
 input.versions[0].baseline_checksum='0'.repeat(64);expect(planParticipantKinds(input,{registrationHistory:true}).report).toMatchObject({ready:1,invalidArchives:1});
});
it('previews and applies idempotently, invalidates changed-kind sessions, and accepts a school signup proof',async()=>{
 const fixture=await testDb();
 try{
  await fixture.db.query("INSERT INTO users(id,role,contact,name) VALUES($1,'participant','account@example.test','Fixture')",[userId]);
  await fixture.db.query("INSERT INTO native_participant_challenges(id,purpose,browser_hash,form_key,identifier,recipient,username,user_id,code_hash,expires_at,consumed_at) VALUES($1,'signup',$2,'school','account@example.test','account@example.test','fixture',$3,$4,now(),now())",[randomUUID(),'a'.repeat(64),userId,'b'.repeat(64)]);
  const before=(await fixture.db.query('SELECT auth_version FROM users WHERE id=$1',[userId])).rows[0].auth_version;
  expect(await backfillParticipantKinds(fixture.db)).toMatchObject({ready:1,updated:0,committed:false,byKind:{school:1}});
  expect((await fixture.db.query('SELECT participant_kind FROM users WHERE id=$1',[userId])).rows[0].participant_kind).toBe('unclassified');
  expect(await backfillParticipantKinds(fixture.db,{commit:true})).toMatchObject({ready:1,updated:1,committed:true});
  const saved=(await fixture.db.query('SELECT participant_kind,auth_version FROM users WHERE id=$1',[userId])).rows[0];expect(saved.participant_kind).toBe('school');expect(saved.auth_version).toBeGreaterThan(before);
  expect(await backfillParticipantKinds(fixture.db,{commit:true})).toMatchObject({ready:0,updated:0,alreadyClassified:1});
 }finally{await fixture.close();}
});
it('commits approved registration history atomically and refuses any corrupted archive without partial changes',async()=>{
 const fixture=await testDb(),entryId=randomUUID(),badId=randomUUID(),payload=registration('48441'),badPayload={ID:'unrelated'};
 try{
  await fixture.db.query("INSERT INTO users(id,role,contact,name) VALUES($1,'participant','account@example.test','Fixture')",[userId]);
  await fixture.db.query("INSERT INTO native_participant_accounts(user_id,username,verified_contact) VALUES($1,'fixture','account@example.test')",[userId]);
  await fixture.db.query("INSERT INTO wordpress_records(id,source,kind,source_id,payload,checksum,captured_at) VALUES($1,$2,'entry','1',$3,$4,now())",[entryId,source,JSON.stringify(payload),fingerprint(payload)]);
  expect(await backfillParticipantKinds(fixture.db,{registrationHistory:true})).toMatchObject({ready:1,updated:0,unclassified:0,byKind:{student:1}});
  await fixture.db.query("INSERT INTO wordpress_records(id,source,kind,source_id,payload,checksum,captured_at) VALUES($1,$2,'user','unrelated',$3,$4,now())",[badId,source,JSON.stringify(badPayload),'0'.repeat(64)]);
  await expect(backfillParticipantKinds(fixture.db,{registrationHistory:true,commit:true})).rejects.toThrow('integrity check');
  expect((await fixture.db.query('SELECT participant_kind FROM users WHERE id=$1',[userId])).rows[0].participant_kind).toBe('unclassified');
  await fixture.db.query('UPDATE wordpress_records SET checksum=$2 WHERE id=$1',[badId,fingerprint(badPayload)]);
  expect(await backfillParticipantKinds(fixture.db,{registrationHistory:true,commit:true})).toMatchObject({ready:1,updated:1,unclassified:0});
  expect((await fixture.db.query('SELECT checksum FROM wordpress_records WHERE id=$1',[entryId])).rows[0].checksum).toBe(fingerprint(payload));
 }finally{await fixture.close();}
});
