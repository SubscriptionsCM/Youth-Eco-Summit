/** Real HTTP/browser role checks, restricted to the disposable loopback migration fixture. */
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {chromium,expect,type Browser,type BrowserContext} from '@playwright/test';
import {db} from '../src/server/db';
import {hashPassword} from '../src/server/auth';

const origin=new URL(process.env.APP_ORIGIN||'https://invalid'),database=new URL(process.env.DATABASE_URL||'https://invalid');
const root=resolve(process.env.YES_ROLE_QA_ROOT||'/invalid');
const loopback=(host:string)=>['127.0.0.1','localhost','[::1]'].includes(host);
assert.equal(process.env.YES_MIGRATION_QA,'true');assert.equal(process.env.YES_MIGRATION_QA_CAPTURE_ONLY,'true');
assert.ok(origin.protocol==='http:'&&loopback(origin.hostname)&&origin.port==='4300');
assert.ok(loopback(database.hostname)&&database.port==='55433'&&database.pathname==='/yes_local_migration');
assert.ok(root.startsWith('/root/yes-migration-20261120/yes-role-qa-'));
assert.equal(process.env.AUTH_PARTICIPANT_PROVIDER,'native');assert.equal(process.env.PORTAL_REFERENCE_FORMS,'true');
assert.equal(process.env.EMAIL_TRANSPORT,'smtp');assert.equal(process.env.SMTP_TEST_MODE,'true');
assert.ok(loopback(process.env.SMTP_HOST||'')&&process.env.SMTP_PORT==='1025');
assert.ok(!process.env.SENDMAIL_PATH&&!process.env.WORDPRESS_ROOT&&!process.env.WORDPRESS_BRIDGE_PATH);
process.umask(0o077);

type Kind='student'|'educator'|'school'|'unclassified'|'judge'|'admin';
type Account={id:string;kind:Kind;contact:string;password:string;role:'participant'|'judge'|'admin'};
const kinds:Kind[]=['student','educator','school','unclassified','judge','admin'];
const checks:string[]=[],httpResults:unknown[]=[],browserResults:unknown[]=[];
const prefix='yes_roles_'+Date.now().toString(36),password=randomBytes(24).toString('base64url');
const accounts={} as Record<Kind,Account>;
let browser:Browser|undefined;
const contexts:BrowserContext[]=[];
const checked=(message:string)=>{checks.push(message);console.log('PASS '+message);};

class Client{
 cookies=new Map<string,string>();
 async request(path:string,method='GET',body?:unknown){
  const response=await fetch(new URL(path,origin),{method,redirect:'error',headers:{Origin:origin.origin,Cookie:[...this.cookies.values()].join('; '),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  for(const header of response.headers.getSetCookie()){const pair=header.split(';',1)[0];this.cookies.set(pair.split('=',1)[0],pair);}
  return response;
 }
 async login(account:Account){
  const path=account.role==='participant'?'/api/auth/participant/login':'/api/auth/login';
  const response=await this.request(path,'POST',{contact:account.contact,password:account.password,confirmPassword:account.password});
  assert.equal(response.status,200,account.kind+' HTTP login');
  return (await response.json()).data.actor;
 }
}

try{
 await mkdir(root,{recursive:true,mode:0o700});
 assert.ok((await db.query("SELECT name FROM schema_migrations WHERE name='024_participant_kinds.sql'")).rows.length,'Apply migration024 in this QA database before running.');
 const stored=await hashPassword(password);
 for(const kind of kinds){
  const role:Account['role']=kind==='judge'||kind==='admin'?kind:'participant';
  const id=randomUUID(),contact=`${prefix}-${kind}@example.test`;
  const account={id,kind,role,contact,password};accounts[kind]=account;
  await db.query('INSERT INTO users(id,role,contact,name,password_hash,participant_kind) VALUES($1,$2,$3,$4,$5,$6)',[id,role,contact,`${kind} ${prefix}`,stored,role==='participant'?kind:'unclassified']);
  if(role==='participant')await db.query('INSERT INTO native_participant_accounts(user_id,username,verified_contact) VALUES($1,$2,$3)',[id,`${prefix}_${kind}`,contact]);
 }
 await writeFile(join(root,'private-access.json'),JSON.stringify({prefix,accounts},null,2),{mode:0o600});
 checked('Seeded six synthetic accounts in the exact isolated QA database');
 const clients={} as Record<Kind,Client>;
 for(const kind of kinds){
  const client=new Client();clients[kind]=client;
  const actor=await client.login(accounts[kind]);assert.equal(actor.role,accounts[kind].role);
  if(actor.role==='participant')assert.equal(actor.participantKind,kind);
  const response=await client.request('/api/auth/session');assert.equal(response.status,200);
  const session=(await response.json()).data.actor;assert.equal(session.id,accounts[kind].id);
  if(actor.role==='participant')assert.equal(session.participantKind,kind);
  const review=await client.request('/api/admin/participant-accounts?kind=all');assert.equal(review.status,kind==='admin'?200:403,kind+' account-review boundary');
  const matrix:[string,unknown,boolean][]=[['student',{},kind==='student'],['teacher',{},kind==='educator'],['school',{},kind==='school'],['open-letter',{'hidden-yes-submitter':'student','radio-yes-entry-mode':'individual'},kind==='student'],['open-letter',{'hidden-yes-submitter':'educator','radio-yes-entry-mode':'individual'},kind==='educator']];
  for(const [formKey,context,allowed] of matrix){
   const response=await client.request('/api/forms/records','POST',{formKey,context});
   assert.equal(response.status,allowed?201:403,`${kind} ${formKey} ${JSON.stringify(context)}`);
   const value=await response.json();
   if(allowed){assert.equal(value.data.record.owner_id,accounts[kind].id);assert.equal(value.data.record.status,'draft');}
   httpResults.push({kind,formKey,context,status:response.status,allowed});
  }
 }
 assert.equal((await new Client().request('/api/forms/records','POST',{formKey:'school'})).status,401);
 checked('Real HTTP logins expose persisted account kind; all thirty registration/entry role cases and admin-review boundaries pass');

 browser=await chromium.launch({headless:true,channel:'chromium',executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
 for(const kind of kinds){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});contexts.push(context);
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin.origin?route.continue():route.abort('blockedbyclient'));
  const page=await context.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin.origin+'/login');
  if(accounts[kind].role!=='participant'){
   await page.getByRole('button',{name:'Admin or judge',exact:true}).click();
   await page.getByLabel('Staff email (required)',{exact:true}).fill(accounts[kind].contact);
   await page.getByLabel('Password (required)',{exact:true}).fill(password);
   await page.getByLabel('Confirm password (required)',{exact:true}).fill(password);
  }else{
   await page.getByLabel('Username or email (required)',{exact:true}).fill(accounts[kind].contact);
   await page.getByLabel('Password (required)',{exact:true}).fill(password);
  }
  const login=page.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith(accounts[kind].role==='participant'?'/api/auth/participant/login':'/api/auth/login'));
  await page.getByRole('button',{name:'Sign in',exact:true}).click();assert.equal((await login).status(),200);
  await page.waitForURL(url=>url.pathname!=='/login');
  await expect(page.locator('main')).toBeVisible();
  if(accounts[kind].role==='participant')await expect(page.getByRole('heading',{name:'My forms & entries',exact:true})).toBeVisible();
  const session=await page.evaluate(async()=>{const response=await fetch('/api/auth/session');return (await response.json()).data.actor;});
  assert.equal(session?.id,accounts[kind].id);
  for(const [formKey,href] of [['student','/register'],['educator','/teachers/register'],['school','/schools/register']]){
   const count=await page.locator(`a[href="${href}"]`).count();
   assert.equal(count>0,kind===formKey,`${kind} dashboard link ${href}`);
  }
  if(kind==='unclassified')await expect(page.getByRole('heading',{name:'Confirm your account type',exact:true})).toBeVisible();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,kind+' mobile overflow');
  await page.screenshot({path:join(root,`${kind}-dashboard.png`),fullPage:false});
  if(kind==='admin'){
   await page.goto(origin.origin+'/admin/tools');
   await expect(page.getByRole('heading',{name:'Participant account types',exact:true})).toBeVisible();
   await page.getByLabel('Name or email',{exact:true}).fill(prefix);
   await page.getByRole('button',{name:'Search accounts',exact:true}).click();
   await expect(page.getByRole('heading',{name:`unclassified ${prefix}`,exact:true})).toBeVisible();
   await page.screenshot({path:join(root,'admin-account-tools.png'),fullPage:false});
  }
  if(kind==='student'||kind==='judge'){
   for(const path of ['/teachers/register','/schools/register']){
    await page.goto(origin.origin+path);await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByText('This form is not available for your account type.',{exact:false})).toBeVisible();
    assert.equal(await page.getByRole('button',{name:'Start form',exact:true}).count(),0);
   }
  }
  if(kind==='judge'){
   await page.goto(origin.origin+'/dashboard');await expect(page.getByText('This account does not have access to this page.',{exact:false})).toBeVisible();
   assert.equal(await page.locator('a[href="/register"],a[href="/teachers/register"],a[href="/schools/register"]').count(),0);
   await page.goto(origin.origin+'/competitions/enter?submitter=student');
   await expect(page.getByText('This account cannot create student or educator competition entries.',{exact:false})).toBeVisible();
  }
  if(kind==='student'){
   await page.goto(origin.origin+'/competitions/enter?submitter=educator');
   await expect(page.getByRole('heading',{name:'Choose your competition',exact:true})).toBeVisible();
   assert.equal(await page.locator('a[href*="submitter=educator"]').count(),0);
   assert.ok(await page.locator('a[href*="submitter=student"]').count());
  }
  assert.deepEqual(errors,[],kind+' browser errors');browserResults.push({kind,login:true,correctDashboard:true,forbiddenLinksAbsent:true,mobileOverflow:false,errors});
  await context.close();
 }
 checked('All six account types sign in through real mobile Chromium with correct dashboard tools and direct-page denial');

 const before=(await db.query('SELECT participant_kind,auth_version FROM users WHERE id=$1',[accounts.student.id])).rows[0];
 const forged=await clients.student.request(`/api/admin/participant-accounts/${accounts.student.id}`,'PATCH',{participantKind:'school',expectedKind:'student',authVersion:before.auth_version});assert.equal(forged.status,403);
 const change=await clients.admin.request(`/api/admin/participant-accounts/${accounts.student.id}`,'PATCH',{participantKind:'educator',expectedKind:'student',authVersion:before.auth_version});assert.equal(change.status,200);
 assert.equal((await (await clients.student.request('/api/auth/session')).json()).data.actor,null);
 assert.equal((await clients.student.request('/api/forms/records','POST',{formKey:'student'})).status,401);
 const refreshed=await clients.student.login(accounts.student);assert.equal(refreshed.participantKind,'educator');
 assert.equal((await clients.student.request('/api/forms/records','POST',{formKey:'student'})).status,403);
 assert.equal((await clients.student.request('/api/forms/records','POST',{formKey:'teacher'})).status,201);
 checked('Only an administrator can reclassify; the old session is immediately invalid and the new session uses the persisted kind');
 const {rows:[final]}=await db.query("SELECT count(*)::int total FROM portal_form_records WHERE owner_id=ANY($1::uuid[]) AND status<>'draft'",[Object.values(accounts).map(account=>account.id)]);assert.equal(final.total,0);
 await writeFile(join(root,'report.json'),JSON.stringify({verifiedAt:new Date().toISOString(),origin:origin.origin,prefix,checks,httpResults,browserResults,productionWrites:0,externalMailSent:0,finalSubmissions:0},null,2)+'\n',{mode:0o600});
 console.log('ROLE_BOUNDARIES_QA_PASSED');
}finally{
 for(const context of contexts)await context.close().catch(()=>{});
 await browser?.close();
}
process.exit(0);
