import { createHash, randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuth, hashPassword } from '../src/server/auth';
import { importNativeParticipantCredentials, localPasswordLogin } from '../src/server/native-participant-auth';
import { testDb } from './helpers/db';

describe('password-verified sign-in audience guidance', () => {
 let fixture: Awaited<ReturnType<typeof testDb>>;
 let auth: ReturnType<typeof createAuth>;
 const origin = 'https://login.example.org', password = 'A fixture password for sign-in 123!';
 const request = (path: string, input: unknown, cookie?: string) => new Request(`${origin}/api/auth/${path}`, {
  method:'POST',headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(input),
 });
 const action = (path: string, input: unknown, cookie?: string) => auth.authAction(request(path,input,cookie),['auth',...path.split('/')]);
 async function user(role: 'owner'|'admin'|'judge'|'participant', name: string, kind = 'student', stored?: string) {
  const id = randomUUID(), contact = `${name}@example.org`, passwordHash = stored ?? await hashPassword(password);
  await fixture.db.query('INSERT INTO users(id,contact,role,password_hash,participant_kind,staff_username) VALUES($1,$2,$3,$4,$5,$6)',[id,contact,role,passwordHash,role==='participant'?kind:'unclassified',role==='participant'?null:name]);
  if (role==='participant') await fixture.db.query('INSERT INTO native_participant_accounts(user_id,username,verified_contact) VALUES($1,$2,$3)',[id,name,contact]);
  return {id,contact,name};
 }
 beforeEach(async () => {
  fixture = await testDb(); vi.stubEnv('AUTH_PARTICIPANT_PROVIDER','native');
  auth = createAuth(fixture.db,{origin,secret:'audience-test-secret-with-at-least-32-characters',secureCookies:false});
 });
 afterEach(async () => { await fixture?.close(); vi.unstubAllEnvs(); });

 it.each(['owner','admin','judge'] as const)('guides a verified %s email and alias without starting or clearing a session',async role => {
  const account = await user(role,role);
  const login = await action('login',{contact:account.name,password,loginAudience:'admin'});
  expect(login?.status).toBe(200);
  const cookie=login!.headers.get('set-cookie')!, before=(await fixture.db.query('SELECT * FROM auth_sessions')).rows;
  for (const contact of [account.contact,account.name.toUpperCase()]) {
   const result=await action('participant/login',{contact,password,loginAudience:'admin',role:'participant',participantKind:'student'},cookie);
   expect(result?.status).toBe(409); expect(result!.headers.get('set-cookie')).toBeNull();
   expect(await result!.json()).toEqual({error:'Use the Admin or judge sign-in option for this account.',code:'LOGIN_AUDIENCE_MISMATCH',loginAudience:'admin'});
  }
  expect((await fixture.db.query('SELECT * FROM auth_sessions')).rows).toEqual(before);
  expect(await auth.getActor(request('session',{},cookie))).toMatchObject({id:account.id,role});
 });

 it.each(['student','educator','school'])('uses stored %s kind for every tab and refuses staff endpoint spoofing',async kind => {
  const account=await user('participant',kind,kind);
  for (const loginAudience of ['student','educator','school','admin']) {
   const result=await action('participant/login',{contact:account.name,password,loginAudience,role:'owner',participantKind:loginAudience,formKey:loginAudience});
   expect(result?.status).toBe(loginAudience===kind?200:409);
   if (loginAudience!==kind) {
    expect(result!.headers.get('set-cookie')).toBeNull();
    expect(await result!.json()).toMatchObject({code:'LOGIN_AUDIENCE_MISMATCH',loginAudience:kind});
   } else expect((await result!.json()).data.actor).toMatchObject({id:account.id,role:'participant',participantKind:kind});
  }
  const wrongEndpoint=await action('login',{contact:account.contact,password,loginAudience:kind});
  expect(wrongEndpoint?.status).toBe(409); expect(await wrongEndpoint!.json()).toMatchObject({loginAudience:kind});
  expect((await fixture.db.query('SELECT role,participant_kind FROM users WHERE id=$1',[account.id])).rows[0]).toEqual({role:'participant',participant_kind:kind});
 });

 it('keeps unclassified participant fallback without inventing a kind or allowing staff sign-in',async () => {
  const account=await user('participant','historical','unclassified');
  for(const loginAudience of ['student','educator','school','admin']) {
   const result=await action('participant/login',{contact:account.name,password,loginAudience});
   expect(result?.status).toBe(200); expect((await result!.json()).data.actor.participantKind).toBe('unclassified');
  }
  const staff=await action('login',{contact:account.contact,password,loginAudience:'admin'});
  expect(staff?.status).toBe(401); expect(await staff!.json()).not.toHaveProperty('loginAudience');
 });

 it('returns one generic failure for unknown, wrong-password, inactive, unverified and unsupported staff credentials',async () => {
  const staff=await user('owner','owner'), participant=await user('participant','unverified');
  const inactive=await user('admin','inactive'); await fixture.db.query('UPDATE users SET active=false WHERE id=$1',[inactive.id]);
  await fixture.db.query("UPDATE native_participant_accounts SET verified_contact='old@example.org' WHERE user_id=$1",[participant.id]);
  const importedStaff=await user('judge','legacy-staff','student','$P$B55D6LjfHDkINU5wF.v2BuuzO0/XPk/');
  const results: {error:string}[]=[];
  for(const [contact,entered] of [[staff.name,'wrong'],['unknown@example.org',password],[inactive.contact,password],[participant.contact,password],[importedStaff.name,'test']]) {
   const result=await action('participant/login',{contact,password:entered,loginAudience:'school'});
   expect(result?.status).toBe(401); expect(result!.headers.get('set-cookie')).toBeNull(); results.push(await result!.json());
  }
  expect(results.every(result=>JSON.stringify(result)===JSON.stringify(results[0]))).toBe(true);
  expect(Object.keys(results[0])).toEqual(['error']);
  expect(results[0].error).toContain('selected sign-in option');
 });

 it('rejects invalid provided audiences while preserving omitted audience compatibility',async () => {
  const account=await user('owner','owner');
  for(const loginAudience of [null,'teacher','owner','',{},['admin']]) {
   for(const path of ['login','participant/login']) expect((await action(path,{contact:account.name,password,loginAudience}))?.status).toBe(400);
  }
  expect((await action('login',{contact:account.name,password}))?.status).toBe(200);
 });

 it('disambiguates alias collisions only by all eligible passwords and rejects multiple correct matches',async () => {
  const staff=await user('owner','shared');
  const participant=await user('participant','participant','educator');
  await fixture.db.query("UPDATE native_participant_accounts SET username='shared' WHERE user_id=$1",[participant.id]);
  const other='Another fixture password 456!', differentHash=await hashPassword(other);
  await fixture.db.query('UPDATE users SET password_hash=$2 WHERE id=$1',[participant.id,differentHash]);
  const hint=await action('participant/login',{contact:'shared',password,loginAudience:'student'});
  expect(hint?.status).toBe(409); expect(await hint!.json()).toMatchObject({loginAudience:'admin'});
  const login=await action('participant/login',{contact:'shared',password:other,loginAudience:'educator'});
  expect(login?.status).toBe(200); expect((await login!.json()).data.actor.id).toBe(participant.id);
  await fixture.db.query('UPDATE users SET password_hash=$2 WHERE id=$1',[staff.id,differentHash]);
  const ambiguous=await action('participant/login',{contact:'shared',password:other,loginAudience:'student'});
  expect(ambiguous?.status).toBe(401); expect(await ambiguous!.json()).not.toHaveProperty('loginAudience');
  expect(ambiguous!.headers.get('set-cookie')).toBeNull();
 });

 it('does not upgrade imported passwords or revoke sessions on mismatch, then upgrades on normal login',async () => {
  const id=randomUUID(),contact='legacy@example.org',stored='$P$B55D6LjfHDkINU5wF.v2BuuzO0/XPk/';
  await fixture.db.query("INSERT INTO users(id,role,contact,participant_kind) VALUES($1,'participant',$2,'educator')",[id,contact]);
  await fixture.db.transaction(tx=>importNativeParticipantCredentials(tx,id,{username:'legacy',email:contact,passwordHash:stored}));
  const token=randomBytes(32).toString('hex'),cookie=`yes_session=${token}`;
  await fixture.db.query("INSERT INTO auth_sessions(token_hash,user_id,auth_version,expires_at) SELECT $1,id,auth_version,now()+interval '1 hour' FROM users WHERE id=$2",[createHash('sha256').update(token).digest('hex'),id]);
  const users=(await fixture.db.query('SELECT * FROM users')).rows,sessions=(await fixture.db.query('SELECT * FROM auth_sessions')).rows;
  for(const path of ['participant/login','login']) {
   const result=await action(path,{contact:'legacy',password:'test',loginAudience:'student'},cookie);
   expect(result?.status).toBe(409); expect(result!.headers.get('set-cookie')).toBeNull();
  }
  expect((await fixture.db.query('SELECT * FROM users')).rows).toEqual(users);
  expect((await fixture.db.query('SELECT * FROM auth_sessions')).rows).toEqual(sessions);
  expect(await auth.getActor(request('session',{},cookie))).toMatchObject({id,participantKind:'educator'});
  expect((await action('participant/login',{contact:'legacy',password:'test',loginAudience:'educator'}))?.status).toBe(200);
  expect((await fixture.db.query('SELECT password_hash FROM users WHERE id=$1',[id])).rows[0].password_hash).toMatch(/^scrypt-/);
  expect(await auth.getActor(request('session',{},cookie))).toBeNull();
 });

 it('does not calculate a replacement password or start a session for an imported mismatch',async () => {
  const account=await user('participant','legacy','educator','$P$B55D6LjfHDkINU5wF.v2BuuzO0/XPk/');
  const hash=vi.fn(async()=>''),startSession=vi.fn(async()=>new Response());
  await expect(localPasswordLogin(fixture.db,{contact:account.name,password:'test',loginAudience:'student'},'participant',startSession,{
   verifyPassword:async()=>false,hashPassword:hash,rateLogin:async()=>{},
  })).rejects.toMatchObject({status:409,details:{loginAudience:'educator'}});
  expect(hash).not.toHaveBeenCalled(); expect(startSession).not.toHaveBeenCalled();
 });

 it('rechecks the credential version under the account lock before revealing audience guidance',async () => {
  const account=await user('owner','owner'),startSession=vi.fn(async()=>new Response());
  await expect(localPasswordLogin(fixture.db,{contact:account.name,password,loginAudience:'student'},'participant',startSession,{
   verifyPassword:async()=>{await fixture.db.query('UPDATE users SET auth_version=auth_version+1 WHERE id=$1',[account.id]);return true;},
   hashPassword:async()=>'',rateLogin:async()=>{},
  })).rejects.toMatchObject({status:401,details:undefined});
  expect(startSession).not.toHaveBeenCalled();
 });

 it.each(['owner','participant'] as const)('shares the %s password budget across aliases, email, endpoints and audiences',async role => {
  const account=await user(role,role),limit=10;
  for(let attempt=0;attempt<limit;attempt++) {
   const path=attempt%2?'login':'participant/login',contact=attempt%3?account.name:account.contact;
   expect((await action(path,{contact,password:'wrong',loginAudience:['student','educator','school','admin'][attempt%4]}))?.status).toBe(401);
  }
  const blocked=await action('login',{contact:account.contact,password,loginAudience:role==='owner'?'admin':'student'});
  expect(blocked?.status).toBe(429); expect(blocked!.headers.get('set-cookie')).toBeNull();
  const key=`login:contact:${createHash('sha256').update(account.contact).digest('hex')}`;
  expect((await fixture.db.query('SELECT count FROM auth_rates WHERE key=$1',[key])).rows[0].count).toBe(limit+1);
 });

 it('uses the same repeated wrong-password threshold for staff, participants, inactive and unknown accounts',async () => {
  const staff=await user('owner','owner'),participant=await user('participant','participant'),inactive=await user('participant','inactive');
  await fixture.db.query('UPDATE users SET active=false WHERE id=$1',[inactive.id]);
  const failures: {error:string}[]=[];
  for(const contact of [staff.contact,participant.contact,inactive.contact,'unknown@example.org']) {
   for(let attempt=0;attempt<10;attempt++) {
    const result=await action('login',{contact,password:'wrong',loginAudience:'admin'});
    expect(result?.status).toBe(401); expect(result!.headers.get('set-cookie')).toBeNull(); failures.push(await result!.json());
   }
   const limited=await action('login',{contact,password:'wrong',loginAudience:'admin'});
   expect(limited?.status).toBe(429); expect(await limited!.json()).not.toHaveProperty('loginAudience');
  }
  expect(failures.every(failure=>JSON.stringify(failure)===JSON.stringify(failures[0]))).toBe(true);
 });

 it('accepts existing shorter scrypt staff passwords without reducing new-password minimums',async () => {
  const plain='short',salt='a'.repeat(32),derived=scryptSync(plain,salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024});
  const account=await user('owner','owner','student',`scrypt-32768-8-3$${salt}$${derived.toString('hex')}`);
  expect((await action('login',{contact:account.name,password:plain,loginAudience:'admin'}))?.status).toBe(200);
  await expect(hashPassword(plain)).rejects.toMatchObject({status:400});
 });
});
