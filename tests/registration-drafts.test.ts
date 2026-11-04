import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { testDb } from './helpers/db';
import type { Actor } from '../src/server/core';
import { completeRegistrationDraft, discardRegistrationDraft, listRegistrationDrafts, reviewTeacherRegistration, saveRegistrationDraft } from '../src/server/registration-drafts';
import { schoolDashboard } from '../src/server/registration';

describe('saved multi-step registrations', () => {
 let fixture: Awaited<ReturnType<typeof testDb>>, guardian: Actor, teacher: Actor, owner: Actor;
 beforeEach(async () => {
  fixture = await testDb();
  guardian = { id:randomUUID(),role:'participant',contact:'+919876543210' };
  teacher = { id:randomUUID(),role:'participant',contact:'+919876543211' };
  owner = { id:randomUUID(),role:'owner',contact:'owner@example.org' };
  for (const actor of [guardian,teacher,owner]) await fixture.db.query('INSERT INTO users(id,role,contact) VALUES($1,$2,$3)',[actor.id,actor.role,actor.contact]);
 });
 afterEach(async () => fixture?.close());
 const draft = (kind:'student'|'school'|'teacher'='student', payload:Record<string,unknown>={name:'Asha'}) => ({id:randomUUID(),kind,scope:'new',payload,currentStep:0,lockVersion:0});
 async function school() { const id=randomUUID();await fixture.db.query("INSERT INTO schools(id,reference,name,address,city,state,postal_code,status) VALUES($1,'EDU-TEST','Test School','1 School Road','Delhi','Delhi','110001','active')",[id]);return id; }
 async function edition() { const id=randomUUID();await fixture.db.query("INSERT INTO editions(id,label,state,registration_opens,registration_closes,config) VALUES($1,'2027','open',now()-interval '1 day',now()+interval '10 days',$2)",[id,JSON.stringify({registrationApproved:true,consentVersion:'v1',consentText:'Approved test participation consent.'})]);return id; }
 it('saves incomplete answers per step, restores only to the owning verified account and refuses stale changes', async () => {
  const input=draft();const saved=await saveRegistrationDraft(fixture.db,guardian,input);
  expect(saved.lock_version).toBe(1);expect(saved.payload.name).toBe('Asha');
  expect((await listRegistrationDrafts(fixture.db,guardian,new URLSearchParams({kind:'student'}))).items[0].id).toBe(input.id);
  expect((await listRegistrationDrafts(fixture.db,teacher,new URLSearchParams({kind:'student'}))).items).toHaveLength(0);
  await expect(saveRegistrationDraft(fixture.db,teacher,{...input,lockVersion:1})).rejects.toMatchObject({status:404});
  const next=await saveRegistrationDraft(fixture.db,guardian,{...input,payload:{name:'Asha',class:7},currentStep:2,lockVersion:1});
  expect(next.current_step).toBe(2);expect(next.payload.class).toBe(7);
  await expect(saveRegistrationDraft(fixture.db,guardian,{...input,lockVersion:1})).rejects.toMatchObject({status:409});
 });
 it('does not accept client-supplied identity or stored consent, and blocks inactive accounts', async () => {
  await expect(saveRegistrationDraft(fixture.db,guardian,draft('student',{name:'Asha',guardianContact:teacher.contact}))).rejects.toThrow();
  await expect(saveRegistrationDraft(fixture.db,guardian,draft('student',{name:'Asha',consent:true}))).rejects.toThrow();
  await fixture.db.query('UPDATE users SET active=false WHERE id=$1',[guardian.id]);
  await expect(saveRegistrationDraft(fixture.db,guardian,draft())).rejects.toMatchObject({status:403});
 });
 it('retains a draft when final validation fails without creating a student record', async () => {
  const input=draft('student',{name:'Asha',schoolId:await school(),editionId:await edition(),class:7});
  await saveRegistrationDraft(fixture.db,guardian,input);
  await expect(completeRegistrationDraft(fixture.db,guardian,input.id,{lockVersion:1,consent:false,consentVersion:'v1'})).rejects.toThrow();
  expect((await fixture.db.query('SELECT count(*)::int total FROM students')).rows[0].total).toBe(0);
  expect((await listRegistrationDrafts(fixture.db,guardian,new URLSearchParams({kind:'student'}))).items[0].state).toBe('draft');
 });
 it('creates a student and consent once, returns an idempotent receipt and locks the completed draft', async () => {
  const input=draft('student',{name:'Asha',schoolId:await school(),editionId:await edition(),class:7});
  await saveRegistrationDraft(fixture.db,guardian,input);
  const final={lockVersion:1,consent:true,consentVersion:'v1'};
  const receipt=await completeRegistrationDraft(fixture.db,guardian,input.id,final);
  expect((await completeRegistrationDraft(fixture.db,guardian,input.id,final)).student.id).toBe(receipt.student.id);
  expect((await fixture.db.query('SELECT count(*)::int total FROM students')).rows[0].total).toBe(1);
  expect((await fixture.db.query('SELECT guardian_contact FROM students')).rows[0].guardian_contact).toBe(guardian.contact);
  expect((await fixture.db.query('SELECT count(*)::int total FROM consents')).rows[0].total).toBe(1);
  await expect(saveRegistrationDraft(fixture.db,guardian,{...input,lockVersion:1})).rejects.toMatchObject({status:409});
  await expect(completeRegistrationDraft(fixture.db,teacher,input.id,final)).rejects.toMatchObject({status:404});
 });
 it('rechecks dates and active-school status when completing a restored registration', async () => {
  const schoolId=await school(),editionId=await edition(),input=draft('student',{name:'Asha',schoolId,editionId,class:7});await saveRegistrationDraft(fixture.db,guardian,input);
  await fixture.db.query("UPDATE editions SET state='closed' WHERE id=$1",[editionId]);
  await expect(completeRegistrationDraft(fixture.db,guardian,input.id,{lockVersion:1,consent:true,consentVersion:'v1'})).rejects.toMatchObject({status:409});
  await fixture.db.query("UPDATE editions SET state='open' WHERE id=$1",[editionId]);await fixture.db.query("UPDATE schools SET status='inactive' WHERE id=$1",[schoolId]);
  await expect(completeRegistrationDraft(fixture.db,guardian,input.id,{lockVersion:1,consent:true,consentVersion:'v1'})).rejects.toMatchObject({status:422});
 });
 it('requires staff review of teacher association before granting the school dashboard', async () => {
  const schoolId=await school(),input=draft('teacher',{schoolId,name:'Ms Sharma',role:'Science Teacher',email:'teacher@example.org',subject:'Science'});
  await saveRegistrationDraft(fixture.db,teacher,input);const receipt=await completeRegistrationDraft(fixture.db,teacher,input.id,{lockVersion:1});
  expect(receipt.status).toBe('pending');
  await expect(schoolDashboard(fixture.db,teacher,schoolId,new URLSearchParams())).rejects.toMatchObject({status:403});
  await expect(reviewTeacherRegistration(fixture.db,teacher,receipt.id,{action:'approved',reason:'School checked'})).rejects.toMatchObject({status:403});
  await reviewTeacherRegistration(fixture.db,owner,receipt.id,{action:'approved',reason:'School association verified by organizer'});
  expect((await schoolDashboard(fixture.db,teacher,schoolId,new URLSearchParams())).school.id).toBe(schoolId);
 });
 it('discards only the latest owned unfinished draft and clears its answers', async () => {
  const input=draft();await saveRegistrationDraft(fixture.db,guardian,input);
  await expect(discardRegistrationDraft(fixture.db,teacher,input.id,1)).rejects.toMatchObject({status:404});
  await expect(discardRegistrationDraft(fixture.db,guardian,input.id,0)).rejects.toMatchObject({status:409});
  await discardRegistrationDraft(fixture.db,guardian,input.id,1);
  expect((await listRegistrationDrafts(fixture.db,guardian,new URLSearchParams({kind:'student'}))).items).toHaveLength(0);
  expect((await fixture.db.query('SELECT payload FROM registration_drafts WHERE id=$1',[input.id])).rows[0].payload).toEqual({});
 });
});
