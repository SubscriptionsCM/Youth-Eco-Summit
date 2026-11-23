import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { testDb } from './helpers/db';
import { db } from '../src/server/db';
import { id, type Actor } from '../src/server/core';
import * as auth from '../src/server/auth';
import { handleRequest } from '../src/server/router';
import { participationWindowStatus } from '../src/data/participation-window';
import { validateReferenceAnswers, referenceForms } from '../src/domain/wordpress-forms';
import { createFormRecord, submitFormRecord, FormValidationError } from '../src/server/portal-forms';

describe('admin-managed participation deadline', () => {
 let store: Awaited<ReturnType<typeof testDb>>, admin: Actor;
 const request=(method='GET',input?:unknown)=>new Request('https://yes.test/api/admin/participation-window',{method,headers:{Origin:'https://yes.test','Content-Type':'application/json'},...(input?{body:JSON.stringify(input)}:{})});
 const call=(method='GET',input?:unknown)=>handleRequest(request(method,input),['admin','participation-window']);
 beforeAll(async()=>{
  store=await testDb(); admin={id:id(),role:'admin',contact:'deadline-admin@example.test'};
  await store.db.query('INSERT INTO users(id,role,contact) VALUES($1,$2,$3)',[admin.id,admin.role,admin.contact]);
 });
 afterEach(()=>vi.restoreAllMocks());
 afterAll(async()=>store?.close());
 function connect(actor:Actor|null=admin){
  vi.spyOn(Date,'now').mockReturnValue(Date.parse('2026-11-23T06:00:00.000Z'));
  vi.spyOn(auth,'getActor').mockResolvedValue(actor);
  vi.spyOn(db,'query').mockImplementation((sql,params)=>store.db.query(sql,params));
  vi.spyOn(db,'transaction').mockImplementation(fn=>store.db.transaction(fn));
 }
 it('uses an overridden deadline until the final millisecond in India',()=>{
  const window={opensAt:'2026-09-30T18:30:00.000Z',closesAt:'2026-12-03T18:30:00.000Z',dateLabel:'3 December 2026',deadlineLabel:'3 December 2026, 11:59 p.m. IST'};
  expect(participationWindowStatus(new Date('2026-12-03T18:29:59.999Z'),window).isOpen).toBe(true);
  expect(participationWindowStatus(new Date('2026-12-03T18:30:00.000Z'),window).state).toBe('closed');
 });
 it('requires an authenticated admin or owner to manage the deadline',async()=>{
  connect(null); expect((await call()).status).toBe(401);
  vi.mocked(auth.getActor).mockResolvedValue({...admin,role:'participant'});
  expect((await call()).status).toBe(403);
  expect((await call('PATCH',{deadlineDate:'2026-12-03',lockVersion:0})).status).toBe(403);
 });
 it('persists a valid date, publishes the same cutoff, and records the staff change',async()=>{
  connect();
  const before=await call(); expect(before.status).toBe(200);
  const initial=(await before.json()).data;
  expect(initial.deadlineDate).toBe('2026-11-30');
  const response=await call('PATCH',{deadlineDate:'2026-12-03',lockVersion:initial.lockVersion});
  expect(response.status).toBe(200);
  const saved=(await response.json()).data;
  expect(saved.window.closesAt).toBe('2026-12-03T18:30:00.000Z');
  expect(saved.window.deadlineLabel).toBe('3 December 2026, 11:59 p.m. IST');
  const publicResponse=await handleRequest(new Request('https://yes.test/api/public/participation-window'),['public','participation-window']);
  expect(publicResponse.headers.get('Cache-Control')).toBe('no-store');
  const published=(await publicResponse.json()).data;
  expect(published.window.closesAt).toBe(saved.window.closesAt);
  expect(published.updatedBy).toBeUndefined();
  const audit=(await store.db.query("SELECT detail FROM audit_events WHERE action='participation.deadline' AND actor_id=$1",[admin.id])).rows;
  expect(audit).toHaveLength(1); expect(audit[0].detail.after.deadlineDate).toBe('2026-12-03');
  expect((await call('PATCH',{deadlineDate:'2026-12-04',lockVersion:initial.lockVersion})).status).toBe(409);
  expect((await store.db.query("SELECT count(*)::int n FROM audit_events WHERE action='participation.deadline'")).rows[0].n).toBe(1);
 });
 it('rejects impossible calendar dates, dates before opening, and past dates without an explicit warning acknowledgement',async()=>{
  connect();
  const version=(await (await call()).json()).data.lockVersion;
  for(const deadlineDate of ['2026-02-30','2026-09-01','not-a-date','2026-12-03T11:00:00Z']) {
   expect((await call('PATCH',{deadlineDate,lockVersion:version})).status).toBe(422);
  }
  expect((await call('PATCH',{deadlineDate:'2026-11-01',lockVersion:version})).status).toBe(422);
 });
 it('applies an override to every competition and student form without closing educator or school registration',()=>{
  const window={opensAt:'2026-09-30T18:30:00.000Z',closesAt:'2026-12-03T18:30:00.000Z',dateLabel:'3 December 2026',deadlineLabel:'3 December 2026, 11:59 p.m. IST'};
  for(const form of referenceForms.filter(f=>f.competition||['student','teacher','school'].includes(f.key))){
   const before=validateReferenceAnswers(form,{}, {final:true,now:new Date('2026-12-03T18:29:59.999Z'),participationWindow:window});
   const after=validateReferenceAnswers(form,{}, {final:true,now:new Date('2026-12-03T18:30:00.000Z'),participationWindow:window});
   expect(before.errors._form).toBeUndefined();
   if(form.competition||form.key==='student') expect(after.errors._form).toContain('3 December 2026');
   else expect(after.errors._form).toBeUndefined();
  }
 });
 it('reads the saved deadline again on final submit for every competition and student form',async()=>{
  const participant:Actor={id:id(),role:'participant',participantKind:'student',contact:'deadline-participant@example.test'};
  await store.db.query("INSERT INTO users(id,role,contact,participant_kind) VALUES($1,$2,$3,'student')",[participant.id,participant.role,participant.contact]);
  for(const form of referenceForms.filter(f=>f.competition||f.key==='student')){
   const draft=await createFormRecord(store.db,participant,{formKey:form.key});
   let before:unknown,after:unknown;
   try{await submitFormRecord(store.db,participant,draft.record.id,{lockVersion:0,answers:{}},undefined,new Date('2026-12-03T18:29:59.999Z'));}catch(error){before=error;}
   try{await submitFormRecord(store.db,participant,draft.record.id,{lockVersion:0,answers:{}},undefined,new Date('2026-12-03T18:30:00.000Z'));}catch(error){after=error;}
   expect(before).toBeInstanceOf(FormValidationError);expect((before as FormValidationError).fields._form).toBeUndefined();
   expect((after as FormValidationError).fields._form).toContain('3 December 2026');
  }
 }); it('requires past-date acknowledgement if a save waits across midnight for the settings lock',async()=>{
  connect();
  const current=(await (await call()).json()).data;
  vi.mocked(Date.now).mockReturnValue(Date.parse('2026-11-30T18:29:59.999Z'));
  vi.mocked(db.transaction).mockImplementation(fn=>store.db.transaction(tx=>fn({...tx,query:async(sql,params)=>{
   if(sql.startsWith('SELECT deadline_date::text,lock_version')&&sql.endsWith('FOR UPDATE'))vi.mocked(Date.now).mockReturnValue(Date.parse('2026-11-30T18:30:00.000Z'));
   return tx.query(sql,params);
  }})));
  const response=await call('PATCH',{deadlineDate:'2026-11-30',lockVersion:current.lockVersion});
  expect(response.status).toBe(422);
  expect((await (await call()).json()).data.deadlineDate).toBe(current.deadlineDate);
 });

});
