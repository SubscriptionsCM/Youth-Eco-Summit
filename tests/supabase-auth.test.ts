import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { testDb } from './helpers/db';
import { linkVerifiedSupabaseIdentity } from '../src/server/supabase-auth';

describe('verified Supabase identity mapping',()=>{
 let fixture:Awaited<ReturnType<typeof testDb>>;
 beforeEach(async()=>{fixture=await testDb();}); afterEach(async()=>fixture?.close());
 it('creates only a participant, ignoring provider metadata claiming staff privileges',async()=>{
  const identity={id:randomUUID(),email:'student@example.org',email_confirmed_at:new Date().toISOString(),user_metadata:{role:'owner'}};
  const user=await linkVerifiedSupabaseIdentity(fixture.db,identity);
  expect(user.role).toBe('participant');
  expect((await linkVerifiedSupabaseIdentity(fixture.db,identity)).id).toBe(user.id);
 });
 it('does not auto-link existing local or staff accounts by matching email',async()=>{
  const existing=randomUUID();await fixture.db.query("INSERT INTO users(id,role,contact) VALUES($1,'owner','owner@example.org')",[existing]);
  await expect(linkVerifiedSupabaseIdentity(fixture.db,{id:randomUUID(),email:'owner@example.org',email_confirmed_at:new Date().toISOString()})).rejects.toMatchObject({status:409});
  expect((await fixture.db.query('SELECT * FROM users')).rows).toHaveLength(1);
 });
 it('refuses unverified identities, disabled linked accounts and changed contact identities',async()=>{
  const identity={id:randomUUID(),email:'student@example.org'};
  await expect(linkVerifiedSupabaseIdentity(fixture.db,identity)).rejects.toMatchObject({status:401});
  const verified={...identity,email_confirmed_at:new Date().toISOString()};
  const user=await linkVerifiedSupabaseIdentity(fixture.db,verified);
  await fixture.db.query('UPDATE users SET active=false WHERE id=$1',[user.id]);
  await expect(linkVerifiedSupabaseIdentity(fixture.db,verified)).rejects.toMatchObject({status:403});
 });
});
