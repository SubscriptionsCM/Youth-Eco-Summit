import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { testDb } from './helpers/db';
import { createFormRecord, getFormRecord, saveFormRecord, submitFormRecord } from '../src/server/portal-forms';
import type { Actor } from '../src/server/core';

describe('reference form persistence', () => {
 let fixture: Awaited<ReturnType<typeof testDb>>, actor:Actor;
 beforeEach(async()=>{fixture=await testDb();actor={id:randomUUID(),role:'participant',contact:'participant@example.org'};await fixture.db.query('INSERT INTO users(id,role,contact) VALUES($1,$2,$3)',[actor.id,actor.role,actor.contact]);});
 afterEach(async()=>fixture?.close());
 it('allows a private saved link for public forms and refuses another token', async()=>{
  const created=await createFormRecord(fixture.db,null,{formKey:'school'});
  expect((await getFormRecord(fixture.db,null,created.record.id,created.token)).id).toBe(created.record.id);
  await expect(getFormRecord(fixture.db,null,created.record.id,'wrong')).rejects.toMatchObject({status:404});
  expect((await fixture.db.query('SELECT draft_token_hash FROM portal_form_records')).rows[0].draft_token_hash).not.toBe(created.token);
 });
 it('requires an account for competition drafts and protects them against other accounts', async()=>{
  await expect(createFormRecord(fixture.db,null,{formKey:'open-letter'})).rejects.toMatchObject({status:401});
  const created=await createFormRecord(fixture.db,actor,{formKey:'open-letter'});
  await expect(getFormRecord(fixture.db,{...actor,id:randomUUID()},created.record.id)).rejects.toMatchObject({status:404});
 });
 it('retains the declared role and entry mode immediately so an untouched saved link can be resumed',async()=>{
  const context={'hidden-yes-submitter':'educator','radio-yes-entry-mode':'individual'};
  const created=await createFormRecord(fixture.db,actor,{formKey:'open-letter',context});
  expect((await getFormRecord(fixture.db,actor,created.record.id)).answers).toEqual(context);
 });
 it('checks optimistic locking and never stores passwords or draft consent', async()=>{
  const created=await createFormRecord(fixture.db,actor,{formKey:'student'});
  const input={answers:{'text-1':'Asha','password-1':'do-not-store','consent-1':true},currentStep:0,lockVersion:0};
  const saved=await saveFormRecord(fixture.db,actor,created.record.id,input);
  expect(saved.answers).toEqual({'text-1':'Asha'});expect(saved.lock_version).toBe(1);
  await expect(saveFormRecord(fixture.db,actor,created.record.id,input)).rejects.toMatchObject({status:409});
 });
 it('does not accept final form values that bypass validations or the school directory', async()=>{
  const created=await createFormRecord(fixture.db,actor,{formKey:'open-letter'});
  await expect(submitFormRecord(fixture.db,actor,created.record.id,{lockVersion:0,answers:{'text-yes-school-id':'forged'}},undefined,new Date('2026-11-04T12:00:00Z'))).rejects.toMatchObject({status:422});
  expect((await getFormRecord(fixture.db,actor,created.record.id)).status).toBe('draft');
 });
});
