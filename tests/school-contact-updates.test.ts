import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { testDb } from './helpers/db';
import { updateSchool } from '../src/server/registration';
import type { Actor } from '../src/server/core';

describe('school contact correction authorization', () => {
 let fixture: Awaited<ReturnType<typeof testDb>>;
 let schoolId: string, primaryId: string, secondaryId: string, teacher: Actor, owner: Actor;
 const input = { name:'Registered School', address:'20 School Road', city:'Delhi', state:'Delhi', postalCode:'110001', contactName:'Updated Teacher', contactRole:'Science Coordinator', email:'updated@example.org', phone:'+919876543212' };
 beforeEach(async () => {
  fixture=await testDb();schoolId=randomUUID();primaryId=randomUUID();secondaryId=randomUUID();
  const principalId=randomUUID();teacher={id:randomUUID(),role:'participant',contact:input.phone};owner={id:randomUUID(),role:'owner'};
  await fixture.db.query("INSERT INTO users(id,role,contact) VALUES($1,'participant','+919876543211'),($2,'participant',$3),($4,'owner','owner@example.org')",[principalId,teacher.id,teacher.contact,owner.id]);
  await fixture.db.query("INSERT INTO schools(id,reference,name,address,city,state,postal_code,status) VALUES($1,'SCH-CONTACT-TEST','Registered School','10 School Road','Delhi','Delhi','110001','active')",[schoolId]);
  await fixture.db.query("INSERT INTO school_contacts(id,school_id,user_id,name,role,email,phone,verified_at,created_at) VALUES($1,$2,$3,'Principal','Principal','principal@example.org','+919876543211',now(),'2020-01-01'),($4,$2,$5,'Teacher','Teacher','teacher@example.org',$6,now(),'2021-01-01')",[primaryId,schoolId,principalId,secondaryId,teacher.id,teacher.contact]);
 });
 afterEach(async () => fixture?.close());
 const contacts=async()=> (await fixture.db.query('SELECT * FROM school_contacts ORDER BY created_at,id')).rows;

 it('lets a secondary teacher correct their own record without changing the primary contact or either verified identity', async () => {
  const before=await contacts();
  await updateSchool(fixture.db,teacher,schoolId,input);
  const after=await contacts();
  expect(after[0]).toEqual(before[0]);
  expect(after[1]).toMatchObject({id:secondaryId,name:input.contactName,role:input.contactRole,email:input.email,phone:teacher.contact,user_id:teacher.id,verified_at:before[1].verified_at});
  expect((await fixture.db.query('SELECT address FROM schools WHERE id=$1',[schoolId])).rows[0].address).toBe(input.address);
  const audit=(await fixture.db.query("SELECT detail FROM audit_events WHERE action='school.contact.correction'")).rows[0].detail;
  expect(audit.before.id).toBe(secondaryId);
 });

 it('rejects unverified, inactive or stale-phone associations before changing school or contact data', async () => {
  const before=await contacts();
  await fixture.db.query('UPDATE school_contacts SET verified_at=NULL WHERE id=$1',[secondaryId]);
  await expect(updateSchool(fixture.db,teacher,schoolId,input)).rejects.toMatchObject({status:403});
  await fixture.db.query('UPDATE school_contacts SET verified_at=now() WHERE id=$1',[secondaryId]);
  await fixture.db.query('UPDATE users SET active=false WHERE id=$1',[teacher.id]);
  await expect(updateSchool(fixture.db,teacher,schoolId,input)).rejects.toMatchObject({status:403});
  await fixture.db.query("UPDATE users SET active=true,contact='+919876543299' WHERE id=$1",[teacher.id]);
  await expect(updateSchool(fixture.db,teacher,schoolId,input)).rejects.toMatchObject({status:403});
  await fixture.db.query('UPDATE users SET contact=$2 WHERE id=$1',[teacher.id,teacher.contact]);
  await expect(updateSchool(fixture.db,{...teacher,role:'judge'},schoolId,input)).rejects.toMatchObject({status:403});
  await expect(updateSchool(fixture.db,teacher,schoolId,{...input,phone:'+919876543299'})).rejects.toMatchObject({status:422});
  expect((await contacts())[0]).toEqual(before[0]);
  expect((await fixture.db.query('SELECT address FROM schools WHERE id=$1',[schoolId])).rows[0].address).toBe('10 School Road');
  expect((await fixture.db.query('SELECT count(*)::int total FROM audit_events')).rows[0].total).toBe(0);
 });

 it('preserves administrator primary-contact correction and invalidates verification when its phone changes', async () => {
  const before=await contacts();
  await updateSchool(fixture.db,owner,schoolId,{...input,phone:'+919876543299'});
  const after=await contacts();
  expect(after[0]).toMatchObject({id:primaryId,name:input.contactName,phone:'+919876543299',user_id:null,verified_at:null});
  expect(after[1]).toEqual(before[1]);
 });
});
