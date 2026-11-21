import {randomUUID} from 'node:crypto';
import {beforeAll,afterAll,expect,it} from 'vitest';
import {testDb} from './helpers/db';
import type {Actor} from '../src/server/core';
import {createFormRecord,getFormRecord,saveFormRecord,submitFormRecord,writableFormRecord} from '../src/server/portal-forms';
import {currentAccessActor} from '../src/server/participant-access';
import {participantAccounts,setParticipantKind} from '../src/server/participant-accounts';
import type {ParticipantKind} from '../src/domain/participant-access';

let fixture:Awaited<ReturnType<typeof testDb>>;
beforeAll(async()=>{fixture=await testDb();});afterAll(async()=>fixture?.close());
async function actor(kind:ParticipantKind='unclassified',role:Actor['role']='participant'):Promise<Actor>{
 const id=randomUUID(),contact=id+'@example.test';
 await fixture.db.query('INSERT INTO users(id,contact,role,participant_kind) VALUES($1,$2,$3,$4)',[id,contact,role,kind]);
 return {id,contact,role,participantKind:kind};
}
it('permits only the account’s matching registration and competition context',async()=>{
 for(const [kind,key] of [['student','student'],['educator','teacher'],['school','school']] as const){
  const account=await actor(kind);
  expect((await createFormRecord(fixture.db,account,{formKey:key})).record.form_key).toBe(key);
  if(kind!=='school')expect((await createFormRecord(fixture.db,account,{formKey:'open-letter'})).record.answers['hidden-yes-submitter']).toBe(kind);
 }
 expect((await createFormRecord(fixture.db,null,{formKey:'partner'})).token).toBeTruthy();
});
it('blocks judges, unclassified accounts and cross-profile registration copied requests',async()=>{
 const accounts=[await actor('student'),await actor('educator'),await actor('school'),await actor(),await actor('unclassified','judge')];
 const allowed={student:'student',educator:'teacher',school:'school',unclassified:''};
 for(const account of accounts)for(const formKey of ['student','teacher','school']){
  if(account.role==='participant'&&allowed[account.participantKind!]===formKey)continue;
  await expect(createFormRecord(fixture.db,account,{formKey,context:{participantKind:'school'}})).rejects.toMatchObject({status:403});
 }
 for(const formKey of ['student','teacher','school'])await expect(createFormRecord(fixture.db,null,{formKey})).rejects.toMatchObject({status:401});
});
it('ignores forged actor subtype and rejects a forged staff role',async()=>{
 const student=await actor('student');
 await expect(createFormRecord(fixture.db,{...student,participantKind:'educator'},{formKey:'teacher'})).rejects.toMatchObject({status:403});
 await expect(currentAccessActor(fixture.db,{...student,role:'admin'})).rejects.toMatchObject({status:401});
 await expect(createFormRecord(fixture.db,student,{formKey:'open-letter',context:{'hidden-yes-submitter':'educator'}})).rejects.toMatchObject({status:403});
});
it('rechecks current subtype for saved draft writes and uploads while retaining owner reads',async()=>{
 const student=await actor('student'),created=await createFormRecord(fixture.db,student,{formKey:'student'});
 await fixture.db.query("UPDATE users SET participant_kind='educator' WHERE id=$1",[student.id]);
 expect((await getFormRecord(fixture.db,student,created.record.id)).id).toBe(created.record.id);
 await expect(saveFormRecord(fixture.db,student,created.record.id,{answers:{},currentStep:0,lockVersion:0})).rejects.toMatchObject({status:403});
 await expect(submitFormRecord(fixture.db,student,created.record.id,{answers:{},lockVersion:0})).rejects.toMatchObject({status:403});
 await expect(writableFormRecord(fixture.db,student,created.record.id)).rejects.toMatchObject({status:403});
});
it('does not let a signed private legacy school draft bypass the logged-in subtype',async()=>{
 const legacy=await createFormRecord(fixture.db,null,{formKey:'partner'});
 await fixture.db.query("UPDATE portal_form_records SET form_key='school' WHERE id=$1",[legacy.record.id]);
 await expect(writableFormRecord(fixture.db,await actor('student'),legacy.record.id,legacy.token)).rejects.toMatchObject({status:403});
 await expect(writableFormRecord(fixture.db,null,legacy.record.id,legacy.token)).rejects.toMatchObject({status:401});
 expect((await writableFormRecord(fixture.db,await actor('school'),legacy.record.id,legacy.token)).id).toBe(legacy.record.id);
});
it('restricts account-type review to active administrators and returns no credentials',async()=>{
 const owner=await actor('unclassified','owner'),student=await actor('student'),judge=await actor('unclassified','judge');
 for(const account of [student,judge])await expect(participantAccounts(fixture.db,account,new URLSearchParams())).rejects.toMatchObject({status:403});
 const listed=await participantAccounts(fixture.db,owner,new URLSearchParams({kind:'student',q:student.contact!}));
 expect(listed.total).toBe(1);expect(listed.items[0].id).toBe(student.id);
 expect(Object.keys(listed.items[0]).sort()).toEqual(['auth_version','contact','id','name','participant_kind']);
});
it('audits reviewed type assignment, invalidates sessions and rejects stale or forged edits',async()=>{
 const owner=await actor('unclassified','owner'),student=await actor('student');
 const initial=(await fixture.db.query('SELECT auth_version FROM users WHERE id=$1',[student.id])).rows[0].auth_version;
 const changed=await setParticipantKind(fixture.db,owner,student.id,{participantKind:'educator',expectedKind:'student',authVersion:initial});
 expect(changed.participant_kind).toBe('educator');expect(changed.auth_version).toBe(initial+1);
 await expect(setParticipantKind(fixture.db,owner,student.id,{participantKind:'school',expectedKind:'student',authVersion:initial})).rejects.toMatchObject({status:409});
 await expect(setParticipantKind(fixture.db,student,student.id,{participantKind:'school',expectedKind:'educator',authVersion:initial+1})).rejects.toMatchObject({status:403});
 const {rows}=await fixture.db.query("SELECT detail FROM audit_events WHERE actor_id=$1 AND action='account.participant_kind'",[owner.id]);
 expect(rows[0].detail).toEqual({before:'student',after:'educator'});
});
