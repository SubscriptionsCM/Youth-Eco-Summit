import {afterAll,beforeAll,expect,it} from 'vitest';
import {testDb} from './helpers/db';
import {createAuth,hashPassword} from '../src/server/auth';
import {adminList} from '../src/server/admin';
import {judgingAdministration} from '../src/server/judge-portal';
import {id,requireAdmin} from '../src/server/core';
import {staffDisplayRole} from '../src/server/staff-presentation';

let store:Awaited<ReturnType<typeof testDb>>;
const developer=id(),otherOwner=id(),administrator=id(),origin='https://presentation.example.test';
const password='Synthetic presentation password 123!';
beforeAll(async()=>{
 store=await testDb();
 const hash=await hashPassword(password);
 await store.db.query('INSERT INTO users(id,role,contact,name,staff_username,password_hash) VALUES($1,$2,$3,$4,$5,$6)',[developer,'owner','developer@example.test','Rudhraksh (Developer)','rudhraksh',hash]);
 await store.db.query("INSERT INTO users(id,role,contact,name) VALUES($1,'owner','owner@example.test','Organization owner'),($2,'admin','admin@example.test','Administrator')",[otherOwner,administrator]);
});
afterAll(async()=>store?.close());
it.each([
 ['owner','rudhraksh','Developer'],['owner','another-owner',undefined],['owner',undefined,undefined],
 ['admin','rudhraksh',undefined],['judge','rudhraksh',undefined],['participant','rudhraksh',undefined],
])('limits the presentation override to the configured owner alias (%s, %s)',(role,staff_username,expected)=>{
 expect(staffDisplayRole({role,staff_username})).toBe(expected);
});
it('adds a Developer label to login/session without changing owner authorization or stored account data',async()=>{
 const before=(await store.db.query('SELECT * FROM users ORDER BY id')).rows;
 const deliveries:string[]=[];
 const auth=createAuth(store.db,{origin,secret:'synthetic-presentation-secret-at-least-32-characters',secureCookies:false,sendEmail:async(_to,_subject,body)=>{deliveries.push(body);}});
 const request=(path:string,input:unknown,cookie='')=>new Request(origin+'/api/auth/'+path,{method:'POST',headers:{origin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(input)});
 const response=await auth.authAction(request('login',{contact:'rudhraksh',password}),['auth','login']);
 expect(response?.status).toBe(200);
 const cookie=response!.headers.get('set-cookie')!;
 const login=(await response!.json()).data.actor;
 expect(login).toMatchObject({id:developer,role:'owner',displayRole:'Developer'});
 expect(login).not.toHaveProperty('staff_username');expect(login).not.toHaveProperty('password_hash');
 const actor=await auth.getActor(request('session',{},cookie));
 expect(actor).toEqual(login);expect(actor).not.toHaveProperty('staff_username');
 expect(()=>requireAdmin(actor!)).not.toThrow();
 const invitation=await auth.authAction(request('invitations',{contact:'new-admin@example.test',role:'admin',name:'Synthetic administrator'},cookie),['auth','invitations']);
 expect(invitation?.status).toBe(200);expect(deliveries).toHaveLength(1);
 expect((await store.db.query('SELECT * FROM users ORDER BY id')).rows).toEqual(before);
});
it('adds the same safe label to staff/reviewer DTOs without exposing aliases or credentials',async()=>{
 const actor={id:developer,role:'owner' as const};
 const staff:Record<string,unknown>[]=(await adminList(store.db,actor,'judges',new URLSearchParams())).items;
 const reviewers=(await judgingAdministration(store.db,actor)).judges;
 for(const rows of [staff,reviewers]){
  expect(rows.find(row=>row.id===developer)).toMatchObject({role:'owner',displayRole:'Developer'});
  expect(rows.find(row=>row.id===otherOwner)).not.toHaveProperty('displayRole');
  expect(rows.find(row=>row.id===administrator)).not.toHaveProperty('displayRole');
  for(const row of rows){expect(row).not.toHaveProperty('staff_username');expect(row).not.toHaveProperty('password_hash');expect(row).not.toHaveProperty('totp_secret');}
 }
});
