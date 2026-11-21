import {afterAll,beforeAll,beforeEach,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {testDb} from './helpers/db';
import type {Actor} from '../src/server/core';
import {claimSchool,createSchool,createStudent,schoolDashboard,updateSchool} from '../src/server/registration';
import {completeRegistrationDraft,saveRegistrationDraft} from '../src/server/registration-drafts';
import {createEntry,entryDetail,submitEntry,updateEntry} from '../src/server/entries';
import {entryAccess} from '../src/server/access';
import {inviteTeam,joinTeam} from '../src/server/teams';
import {schoolWorkspaceRoute} from '../src/server/school-workspace';

let f:Awaited<ReturnType<typeof testDb>>;
const student:Actor={id:randomUUID(),role:'participant',contact:'+919000100001',participantKind:'school'};
const educator:Actor={id:randomUUID(),role:'participant',contact:'+919000100002',participantKind:'student'};
const school:Actor={id:randomUUID(),role:'participant',contact:'+919000100003'};
const judge:Actor={id:randomUUID(),role:'judge',contact:'judge@roles.test'};
const schoolId=randomUUID(),editionId=randomUUID(),studentId=randomUUID(),participationId=randomUUID(),competitionId=randomUUID(),entryId=randomUUID();
const profile={name:'New Role School',address:'1 School Road',city:'Delhi',state:'Delhi',postalCode:'110001',contactName:'Verified Contact',contactRole:'Coordinator',email:'contact@roles.test'};
beforeAll(async()=>{
 f=await testDb();
 for(const actor of [student,educator,school,judge])await f.db.query('INSERT INTO users(id,role,contact) VALUES($1,$2,$3)',[actor.id,actor.role,actor.contact]);
 await f.db.query("INSERT INTO schools(id,reference,name,address,city,state,postal_code,status) VALUES($1,'ROLE-SCHOOL','Existing Role School','1 Road','Delhi','Delhi','110001','active')",[schoolId]);
 await f.db.query("INSERT INTO editions(id,label,state,registration_opens,registration_closes,config) VALUES($1,'Role tests','open',now()-interval '1 day',now()+interval '1 day',$2)",[editionId,JSON.stringify({registrationApproved:true,consentVersion:'roles-1',consentText:'Test participation consent.'})]);
 await f.db.query("INSERT INTO students(id,reference,name,guardian_contact) VALUES($1,'ROLE-STUDENT','Role Student',$2)",[studentId,student.contact]);
 await f.db.query('INSERT INTO participant_access(user_id,student_id) VALUES($1,$2)',[student.id,studentId]);
 await f.db.query("INSERT INTO student_participations(id,student_id,school_id,edition_id,class,snapshot) VALUES($1,$2,$3,$4,5,'{}')",[participationId,studentId,schoolId,editionId]);
 const config={mode:'individual',entryLimit:null,minMembers:1,maxMembers:1,categories:[{id:'junior',label:'Junior',classes:[5]}],fields:[],files:{minCount:0,maxCount:0,maxBytes:1000,types:['application/pdf']}};
 await f.db.query("INSERT INTO competitions(id,edition_id,slug,title,guidelines,status,opens_at,closes_at,config) VALUES($1,$2,'role-competition','Role Competition','Test guidelines','approved',now()-interval '1 day',now()+interval '1 day',$3)",[competitionId,editionId,JSON.stringify(config)]);
 await f.db.query("INSERT INTO submissions(id,reference,student_participation_id,competition_id,category_id) VALUES($1,'ROLE-ENTRY',$2,$3,'junior')",[entryId,participationId,competitionId]);
 for(const actor of [student,educator,school]){
  await f.db.query("INSERT INTO school_contacts(id,school_id,user_id,name,role,email,phone,verified_at) VALUES($1,$2,$3,'Role Contact','Coordinator','contact@roles.test',$4,now())",[randomUUID(),schoolId,actor.id,actor.contact]);
  await f.db.query("INSERT INTO school_access_requests(id,school_id,user_id,status,reason) VALUES($1,$2,$3,'approved','Test-only approved association')",[randomUUID(),schoolId,actor.id]);
 }
});
beforeEach(async()=>{
 await f.db.query("UPDATE users SET active=true,participant_kind=CASE WHEN id=$1 THEN 'student' WHEN id=$2 THEN 'educator' WHEN id=$3 THEN 'school' ELSE 'unclassified' END",[student.id,educator.id,school.id]);
});
afterAll(async()=>f?.close());

it('does not let students, educators or judges register a school using a copied API',async()=>{
 for(const actor of [student,educator,judge])await expect(createSchool(f.db,actor,{...profile,phone:actor.contact})).rejects.toMatchObject({status:403});
 const created=await createSchool(f.db,school,{...profile,phone:school.contact});expect(created.status).toBe('pending');
});
it('requires the persisted student kind for the older student-registration endpoint',async()=>{
 const input={name:'New Student',schoolId,editionId,class:5,consent:true,consentVersion:'roles-1'};
 for(const actor of [educator,school,judge])await expect(createStudent(f.db,actor,{...input,guardianContact:actor.contact})).rejects.toMatchObject({status:403});
 expect((await createStudent(f.db,student,{...input,guardianContact:student.contact})).student.name).toBe('New Student');
});
it('blocks mismatched registration drafts while allowing the correct educator form',async()=>{
 const draft=(kind:'student'|'teacher'|'school')=>({id:randomUUID(),kind,scope:'new',payload:{name:'Role Test'},currentStep:0,lockVersion:0});
 for(const kind of ['teacher','school'] as const)await expect(saveRegistrationDraft(f.db,student,draft(kind))).rejects.toMatchObject({status:403});
 await expect(saveRegistrationDraft(f.db,educator,draft('student'))).rejects.toMatchObject({status:403});
 await expect(saveRegistrationDraft(f.db,judge,draft('student'))).rejects.toMatchObject({status:403});
 expect((await saveRegistrationDraft(f.db,educator,draft('teacher'))).kind).toBe('teacher');
});
it('does not let ownership of an older cross-type draft bypass the new boundary',async()=>{
 const id=randomUUID();await f.db.query("INSERT INTO registration_drafts(id,owner_id,kind,scope) VALUES($1,$2,'school','new')",[id,student.id]);
 await expect(completeRegistrationDraft(f.db,student,id,{lockVersion:0})).rejects.toMatchObject({status:403});
 expect((await f.db.query('SELECT state FROM registration_drafts WHERE id=$1',[id])).rows[0].state).toBe('draft');
});
it('denies old entry mutations after a database kind change while retaining owned reads',async()=>{
 expect((await entryAccess(f.db,student,entryId,true)).id).toBe(entryId);
 await f.db.query("UPDATE users SET participant_kind='educator' WHERE id=$1",[student.id]);
 const stale={...student,participantKind:'student'} as Actor;
 expect((await entryAccess(f.db,stale,entryId)).id).toBe(entryId);
 expect((await entryDetail(f.db,stale,entryId)).entry.canEdit).toBe(false);
 await expect(createEntry(f.db,stale,{participationId,competitionId})).rejects.toMatchObject({status:403});
 await expect(updateEntry(f.db,stale,entryId,{lockVersion:0})).rejects.toMatchObject({status:403});
 await expect(submitEntry(f.db,stale,entryId,0)).rejects.toMatchObject({status:403});
 await expect(inviteTeam(f.db,stale,entryId,{contact:educator.contact})).rejects.toMatchObject({status:403});
 await expect(joinTeam(f.db,stale,{token:'a'.repeat(64),participationId,consent:true})).rejects.toMatchObject({status:403});
});
it('rejects a student school workspace even with old verified contact and approval rows',async()=>{
 await expect(claimSchool(f.db,student,'ROLE-SCHOOL')).rejects.toMatchObject({status:403});
 await expect(updateSchool(f.db,student,schoolId,{...profile,phone:student.contact})).rejects.toMatchObject({status:403});
 await expect(schoolDashboard(f.db,student,schoolId,new URLSearchParams())).rejects.toMatchObject({status:403});
 await expect(schoolWorkspaceRoute(new Request('http://localhost/api/school-workspace'),f.db,student,[])).rejects.toMatchObject({status:403});
 expect((await schoolDashboard(f.db,educator,schoolId,new URLSearchParams())).school.id).toBe(schoolId);
 expect((await schoolDashboard(f.db,school,schoolId,new URLSearchParams())).school.id).toBe(schoolId);
});
