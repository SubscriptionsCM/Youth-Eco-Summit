import { beforeAll,afterAll,describe,it,expect } from 'vitest';
import { testDb } from './helpers/db';
import { id,type Actor } from '../src/server/core';
import { createSchool,createStudent,claimSchool,updateSchool,participantDashboard } from '../src/server/registration';
import { createEntry,submitEntry } from '../src/server/entries';
import { routeEntries, saveReview } from '../src/server/judging';
import { entryAccess } from '../src/server/access';
import { trash,restore,requestPurge,executePurge } from '../src/server/trash';
import { adminPatch } from '../src/server/admin';
import { inviteTeam,joinTeam } from '../src/server/teams';
describe('retained registration and judging workflow',()=>{
 let store:Awaited<ReturnType<typeof testDb>>, parent:Actor,other:Actor,admin:Actor,judge:Actor,judgeB:Actor;
 let schoolId:string,editionId:string,competitionId:string,participationId:string,entryId:string,roundId:string;
 const config={mode:'individual',entryLimit:1,minMembers:1,maxMembers:1,categories:[{id:'junior',label:'Junior',classes:[5]}],fields:[{key:'title',label:'Title',type:'text',required:true}],files:{minCount:1,maxCount:1,maxBytes:10000,types:['application/pdf']}};
 beforeAll(async()=>{
  store=await testDb();
  [parent,other,admin,judge,judgeB]=await Promise.all(['participant','participant','admin','judge','judge'].map(async(role,i)=>{const actor={id:id(),role:role as Actor['role'],contact:`+91900000000${i}`};await store.db.query('INSERT INTO users(id,role,contact) VALUES($1,$2,$3)',[actor.id,role,actor.contact]);return actor;}));
  schoolId=id();editionId=id();competitionId=id();roundId=id();
  await store.db.query("INSERT INTO editions(id,label,state,registration_opens,registration_closes,config) VALUES($1,'Test edition','open',now()-interval '1 day',now()+interval '1 day',$2)",[editionId,JSON.stringify({registrationApproved:true,consentVersion:'test-1',consentText:'Test guardian consent',schoolVerificationApproved:true})]);
  await store.db.query("INSERT INTO schools(id,reference,name,address,city,state,postal_code,status) VALUES($1,'SCH-TEST','School One','Street one','Delhi','Delhi','110001','active')",[schoolId]);
  await store.db.query("INSERT INTO competitions(id,edition_id,slug,title,guidelines,status,opens_at,closes_at,config) VALUES($1,$2,'essay','Test essay','Test guidelines','approved',now()-interval '1 day',now()+interval '1 day',$3)",[competitionId,editionId,JSON.stringify(config)]);
 });
 afterAll(async()=>{await store?.close();});
 it('retains school coordinator details on registration and audited correction',async()=>{
  const profile={name:'Coordinator school',address:'Coordinator street',city:'Delhi',state:'Delhi',postalCode:'110002',contactName:'Primary contact',contactRole:'Principal',email:'coordinator-school@example.test',phone:parent.contact!,coordinator:'Teacher One, science coordinator'};
  const school=await createSchool(store.db,parent,profile);
  expect(school.coordinator).toBe(profile.coordinator);
  expect((await store.db.query('SELECT id FROM school_contacts WHERE school_id=$1',[school.id])).rows).toHaveLength(1);
  const corrected=await updateSchool(store.db,admin,school.id,{...profile,coordinator:'Teacher Two, activities coordinator'});
  expect(corrected.coordinator).toBe('Teacher Two, activities coordinator');
  const dashboard=await participantDashboard(store.db,parent);
  expect(dashboard.schools.filter(s=>s.id===school.id)).toHaveLength(1);
  expect(dashboard.schools.find(s=>s.id===school.id)?.coordinator).toBe(corrected.coordinator);
 });
 it('blocks unknown schools and records distinct siblings with one verified contact',async()=>{
  const input={name:'Student One',schoolId:id(),editionId,class:5,guardianContact:parent.contact!,consent:true,consentVersion:'test-1'};
  await expect(createStudent(store.db,parent,input)).rejects.toThrow();
  const first=await createStudent(store.db,parent,{...input,schoolId});
  const second=await createStudent(store.db,parent,{...input,schoolId,name:'Student Two'});
  expect(first.student.id).not.toBe(second.student.id);participationId=first.participation.id;
  const access=await store.db.query('SELECT * FROM participant_access WHERE user_id=$1',[parent.id]);expect(access.rows).toHaveLength(2);
 });
 it('reuses an authorized student identity for another edition without duplicating the student',async()=>{
  const {rows:[original]}=await store.db.query('SELECT student_id FROM student_participations WHERE id=$1',[participationId]);
  const nextEdition=id();
  await store.db.query("INSERT INTO editions(id,label,state,registration_opens,registration_closes,config) VALUES($1,'Next test edition','open',now()-interval '1 day',now()+interval '1 day',$2)",[nextEdition,JSON.stringify({registrationApproved:true,consentVersion:'next-1',consentText:'Next edition guardian consent'})]);
  const input={name:'Student One',studentId:original.student_id,schoolId,editionId:nextEdition,class:6,guardianContact:parent.contact!,consent:true,consentVersion:'next-1'};
  const before=(await participantDashboard(store.db,parent)).students.length;
  const registered=await createStudent(store.db,parent,input);
  expect(registered.student.id).toBe(original.student_id);
  expect(registered.participation.class).toBe(6);
  expect((await participantDashboard(store.db,parent)).students.length).toBe(before);
  await expect(createStudent(store.db,parent,input)).rejects.toThrow('already registered');
  await expect(createStudent(store.db,other,{...input,guardianContact:other.contact})).rejects.toThrow('Student not found');
 });
 it('does not authorize another parent or finalize an entry with missing retained files',async()=>{
  const entry=await createEntry(store.db,parent,{participationId,competitionId,answers:{title:'My essay'},memberIds:[]});entryId=entry.id;
  await expect(entryAccess(store.db,other,entryId)).rejects.toThrow();
  await expect(submitEntry(store.db,parent,entryId,0)).rejects.toThrow();
 });
 it('finalizes once and retains an immutable revision and receipt on retries',async()=>{
  await store.db.query("INSERT INTO assets(id,submission_id,revision,uploader_id,original_name,storage_key,mime_type,byte_size,checksum,expected_size,expected_checksum,part_size,status) VALUES($1,$2,1,$3,'essay.pdf',$4,'application/pdf',100,$5,100,$5,8388608,'ready')",[id(),entryId,parent.id,`submissions/${entryId}/${id()}`, 'a'.repeat(64)]);
  const first=await submitEntry(store.db,parent,entryId,0);const retry=await submitEntry(store.db,parent,entryId,0);
  expect(first.reference).toBe(retry.reference);expect(first.state).toBe('submitted');
  expect((await store.db.query('SELECT * FROM submission_revisions WHERE submission_id=$1',[entryId])).rows).toHaveLength(1);
  const next=await createEntry(store.db,parent,{participationId,competitionId,answers:{title:'Other'},memberIds:[]});
  await expect(submitEntry(store.db,parent,next.id,0)).rejects.toThrow();
 });
 it('materializes assignments once, isolates judges, and honors revocation',async()=>{
  await store.db.query("INSERT INTO review_rounds(id,competition_id,name,kind,eligible_states,open,rubric) VALUES($1,$2,'Screening','screening','[\"submitted\"]',true,$3)",[roundId,competitionId,JSON.stringify({criteria:[{id:'guideline',label:'Guideline',min:0,max:1,required:true,weight:1}],commentRequired:true})]);
  await store.db.query('INSERT INTO assignment_rules(id,competition_id,category_id,round_id,judge_id) VALUES($1,$2,$3,$4,$5)',[id(),competitionId,'junior',roundId,judge.id]);
  await routeEntries(store.db);await routeEntries(store.db);
  const assignments=(await store.db.query('SELECT * FROM judge_assignments WHERE submission_id=$1',[entryId])).rows;expect(assignments).toHaveLength(1);
  await expect(entryAccess(store.db,judgeB,entryId)).rejects.toThrow();
  expect((await entryAccess(store.db,judge,entryId)).id).toBe(entryId);
  await saveReview(store.db,judge,assignments[0].id,{scores:{guideline:1},comment:'Meets guidelines',lockVersion:0},true);
  await expect(saveReview(store.db,judge,assignments[0].id,{scores:{guideline:0},comment:'Changed',lockVersion:1},true)).rejects.toThrow();
  await store.db.query("UPDATE judge_assignments SET active=false,revoked_at=now() WHERE id=$1",[assignments[0].id]);
  await routeEntries(store.db);
  await expect(entryAccess(store.db,judge,entryId)).rejects.toThrow();
  expect((await store.db.query('SELECT * FROM reviews WHERE assignment_id=$1',[assignments[0].id])).rows).toHaveLength(1);
 });
 it('blocks parent deletion without explicit dependency approval and preserves revoked access after restore',async()=>{
  await expect(trash(store.db,admin,{type:'schools',id:schoolId,reason:'Duplicate review',includeDependencies:false})).rejects.toThrow();
  const batch=await trash(store.db,admin,{type:'submissions',id:entryId,reason:'Removal request',includeDependencies:false});
  await expect(entryAccess(store.db,parent,entryId)).rejects.toThrow();
  await restore(store.db,admin,batch.id);
  expect((await entryAccess(store.db,parent,entryId)).state).toBe('submitted');
  await expect(entryAccess(store.db,judge,entryId)).rejects.toThrow();
 });
 it('binds returning school access to the verified contact and revokes a corrected old binding',async()=>{
  await store.db.query("INSERT INTO school_contacts(id,school_id,name,role,email,phone) VALUES($1,$2,'Teacher','Coordinator','school@example.test',$3)",[id(),schoolId,parent.contact]);
  await expect(claimSchool(store.db,other,'SCH-TEST')).rejects.toThrow();
  expect((await claimSchool(store.db,parent,'SCH-TEST')).id).toBe(schoolId);
  const correction={name:'School Corrected',address:'Street one',city:'Delhi',state:'Delhi',postalCode:'110001',contactName:'New teacher',contactRole:'Coordinator',email:'school@example.test',phone:other.contact};
  await updateSchool(store.db,admin,schoolId,correction);
  await adminPatch(store.db,admin,'schools',schoolId,{action:'approve',reason:'Verified corrected contact through school office'});
  await expect(updateSchool(store.db,parent,schoolId,{...correction,phone:parent.contact})).rejects.toThrow();
  expect((await claimSchool(store.db,other,schoolId)).id).toBe(schoolId);
  const {rows:[revision]}=await store.db.query('SELECT context FROM submission_revisions WHERE submission_id=$1',[entryId]);expect(revision.context.school.name).toBe('School One');
 });
 it('requires matching guardian team acceptance and shows a shared receipt without granting editing',async()=>{
  const teamCompetition=id();const teamConfig={...config,mode:'team',teamSchoolPolicy:'same_school',teamClassPolicy:'same_category',minMembers:2,maxMembers:2,files:{...config.files,minCount:0,maxCount:0}};
  await store.db.query("INSERT INTO competitions(id,edition_id,slug,title,guidelines,status,opens_at,closes_at,config) VALUES($1,$2,'team','Team activity','Test rules','approved',now()-interval '1 day',now()+interval '1 day',$3)",[teamCompetition,editionId,JSON.stringify(teamConfig)]);
  const member=await createStudent(store.db,other,{name:'Another guardian student',schoolId,editionId,class:5,guardianContact:other.contact,consent:true,consentVersion:'test-1'});
  const team=await createEntry(store.db,parent,{participationId,competitionId:teamCompetition,answers:{title:'Team entry'}});
  const invitation=await inviteTeam(store.db,parent,team.id,{contact:other.contact});const token=new URL(invitation.invitePath,'https://example.test').searchParams.get('token');
  await expect(joinTeam(store.db,parent,{token,participationId:member.participation.id,consent:true})).rejects.toThrow();
  await joinTeam(store.db,other,{token,participationId:member.participation.id,consent:true});
  expect((await participantDashboard(store.db,other)).entries.some(e=>e.id===team.id)).toBe(true);
  expect((await entryAccess(store.db,other,team.id)).id).toBe(team.id);
  await expect(entryAccess(store.db,other,team.id,true)).rejects.toThrow();
  const final=await submitEntry(store.db,parent,team.id,1);expect(final.state).toBe('submitted');
  await expect(trash(store.db,admin,{type:'students',id:member.student.id,reason:'A shared member',includeDependencies:true})).rejects.toThrow();
 });
 it('denies judge direct access after an edition is archived',async()=>{
  await store.db.query('UPDATE judge_assignments SET active=true,revoked_at=NULL WHERE submission_id=$1',[entryId]);
  await adminPatch(store.db,admin,'editions',editionId,{action:'archive',reason:'Edition finished'});
  await expect(entryAccess(store.db,judge,entryId)).rejects.toThrow();
 });
 it('checks separately trashed annual school records before calling object deletion',async()=>{
  const sid=id(),oldBatch=id(),annual=id();
  await store.db.query("INSERT INTO schools(id,reference,name,address,city,state,postal_code,status) VALUES($1,'SCH-PURGE','Purge school','Separate road','Delhi','Delhi','110009','active')",[sid]);
  await store.db.query("INSERT INTO deletion_batches(id,actor_id,reason,root_type,root_id,items) VALUES($1,$2,'Prior removal','school_participations',$3,'[]')",[oldBatch,admin.id,annual]);
  await store.db.query('INSERT INTO school_participations(id,school_id,edition_id,snapshot,trashed_at,deletion_batch_id) VALUES($1,$2,$3,$4,now(),$5)',[annual,sid,editionId,'{}',oldBatch]);
  const batch=await trash(store.db,admin,{type:'schools',id:sid,reason:'School removal',includeDependencies:true});
  await store.db.query("UPDATE deletion_batches SET status='purging' WHERE id=$1",[batch.id]);
  let attempted=false;
  await expect(executePurge(store.db,batch.id,async()=>{attempted=true;})).rejects.toThrow('annual school');
  expect(attempted).toBe(false);
  expect((await store.db.query('SELECT id FROM schools WHERE id=$1',[sid])).rows).toHaveLength(1);
 });
 it('keeps purge failures visible and retries deletion without losing retained metadata early',async()=>{
  const batch=await trash(store.db,admin,{type:'submissions',id:entryId,reason:'Approved permanent removal',includeDependencies:false});
  await expect(requestPurge(store.db,admin,batch.id,batch.id)).rejects.toThrow();
  const owner:Actor={id:id(),role:'owner'};await store.db.query("INSERT INTO users(id,role,contact) VALUES($1,'owner','owner@example.test')",[owner.id]);
  await requestPurge(store.db,owner,batch.id,batch.id);
  await expect(executePurge(store.db,batch.id,async()=>{throw new Error('Storage outage');})).rejects.toThrow();
  expect((await store.db.query('SELECT status FROM deletion_batches WHERE id=$1',[batch.id])).rows[0].status).toBe('purge_failed');
  expect((await store.db.query('SELECT id FROM assets WHERE submission_id=$1',[entryId])).rows).toHaveLength(1);
  await expect(entryAccess(store.db,owner,entryId)).rejects.toThrow();
  const removed:string[]=[];await executePurge(store.db,batch.id,async keys=>{removed.push(...keys);});
  expect(removed).toHaveLength(1);expect((await store.db.query('SELECT id FROM submissions WHERE id=$1',[entryId])).rows).toHaveLength(0);
  expect((await store.db.query('SELECT * FROM purge_ledger WHERE entity_id=$1',[entryId])).rows).toHaveLength(1);
 });
});
