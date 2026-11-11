import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { testDb } from './helpers/db';
import { id } from '../src/server/core';
import { enqueueFormNotifications, deliverFormNotifications, type NotificationBridge } from '../src/server/form-notifications';
import type { ObjectStore } from '../src/server/storage/provider';

describe('durable submitted-form notifications', () => {
 let fixture: Awaited<ReturnType<typeof testDb>>, folder: string, recordId: string, ownerId: string;
 const bytes = Buffer.from('%PDF-1.7\n private attachment');
 const checksum = createHash('sha256').update(bytes).digest('hex');
 const packet = (slug: string, attachments: string[] = []) => ({ notificationSlug: slug, recipients: ['organizer@example.test'], subject: 'Native form notification', body: '<p>Source content</p>', headers: ['Content-Type: text/html; charset=UTF-8'], attachmentFieldIds: attachments });
 beforeAll(async()=>{fixture=await testDb();});
 afterAll(async()=>{await fixture?.close();});
 beforeEach(async () => {
  recordId = id(); ownerId = id();
  vi.stubEnv('APP_ORIGIN', 'https://summit.example.test');
  const parent = resolve('.local/test-temp'); await mkdir(parent, { recursive: true }); folder = await mkdtemp(join(parent, 'notification-'));
  await fixture.db.query("INSERT INTO users(id,role,contact) VALUES($1,'participant',$2)",[ownerId,ownerId]);
  await fixture.db.query("INSERT INTO portal_form_records(id,form_key,owner_id,reference,status,answers,form_snapshot,submitted_at) VALUES($1,'partner',$2,$3,'submitted',$4,$5,now())",[recordId,ownerId,`YES-${recordId}`,JSON.stringify({'email-1':'submitter@example.test'}),JSON.stringify({id:48543,key:'partner'})]);
 });
 afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await fixture.db.query('TRUNCATE portal_form_notification_deliveries,portal_form_notification_runs,jobs,portal_form_files,portal_form_records,users CASCADE'); if(folder)await rm(folder,{recursive:true,force:true}); });
 async function enqueue() { await fixture.db.transaction(tx => enqueueFormNotifications(tx,recordId)); }
 async function addFile(options: { recordId?: string; size?: number; key?: string } = {}) {
  const fileId = id();
  await fixture.db.query("INSERT INTO portal_form_files(id,record_id,field_id,filename,storage_key,expected_size,expected_checksum,mime_type,status,metadata) VALUES($1,$2,'upload-1','../../source.pdf',$3,$4,$5,'application/pdf','ready',$6)",[fileId,options.recordId || recordId,options.key || `submissions/${recordId}/${fileId}`,options.size || bytes.length,checksum,JSON.stringify({storageVersion:'version-1',storageEtag:'etag-1'})]);
  return fileId;
 }
 const store = (content = bytes): Pick<ObjectStore,'head'|'read'> => ({
  async head() { return {ContentLength:content.length,VersionId:'version-1',ETag:'etag-1'}; },
  async read(_key,version,etag) { expect(version).toBe('version-1');expect(etag).toBe('etag-1');async function* chunks(){yield content;}return {Body:chunks()}; }
 });

 it('enqueues once inside submission transactions and persists one immutable native plan',async()=>{
  await enqueue();await enqueue();
  expect((await fixture.db.query("SELECT * FROM jobs WHERE kind='form_notifications'")).rows).toHaveLength(1);
  let plans=0,mails=0;
  const bridge:NotificationBridge={async call(action,input){if(action==='notification-plan'){plans++;expect(input).toMatchObject({recordId,formId:48543,portalOrigin:'https://summit.example.test'});return [packet('admin')];}mails++;return {sent:true};}};
  await deliverFormNotifications(fixture.db,recordId,{bridge});await deliverFormNotifications(fixture.db,recordId,{bridge});
  expect({plans,mails}).toEqual({plans:1,mails:1});
  expect((await fixture.db.query('SELECT status,ordinal FROM portal_form_notification_deliveries')).rows).toEqual([{status:'delivered',ordinal:1}]);
  await expect(fixture.db.query("UPDATE portal_form_notification_deliveries SET payload='{}'")).rejects.toThrow(/immutable/);
  await expect(fixture.db.query("UPDATE portal_form_notification_runs SET context='{}'")).rejects.toThrow(/immutable/);
 });

 it('retries planning failures before mail without retaining a partial plan',async()=>{
  await enqueue();let attempts=0,mails=0;
  const bridge:NotificationBridge={async call(action){if(action==='notification-plan'){if(++attempts===1)throw new Error('Unavailable');return [packet('admin')];}mails++;return {sent:true};}};
  await expect(deliverFormNotifications(fixture.db,recordId,{bridge})).rejects.toThrow();
  expect((await fixture.db.query('SELECT * FROM portal_form_notification_deliveries')).rows).toHaveLength(0);
  await deliverFormNotifications(fixture.db,recordId,{bridge});expect(mails).toBe(1);
 });

 it('retains partial successes and never repeats ambiguous or successful deliveries',async()=>{
  await enqueue();const sent:string[]=[];
  const bridge:NotificationBridge={async call(action,input){if(action==='notification-plan')return [packet('first'),packet('uncertain'),packet('last')];sent.push(String(input.notificationSlug));if(input.notificationSlug==='uncertain')throw new Error('SMTP response lost');return {sent:true};}};
  const result=await deliverFormNotifications(fixture.db,recordId,{bridge});
  expect(result).toMatchObject({delivered:2,review:1,pending:0});
  await deliverFormNotifications(fixture.db,recordId,{bridge});expect(sent).toEqual(['first','uncertain','last']);
 });

 it('moves a crash-left sending delivery to review without resending',async()=>{
  await enqueue();
  await fixture.db.query('UPDATE portal_form_notification_runs SET planned_at=now() WHERE record_id=$1',[recordId]);
  await fixture.db.query("INSERT INTO portal_form_notification_deliveries(id,record_id,ordinal,notification_slug,payload,status,attempt_token,sending_started_at) VALUES($1,$2,1,'admin',$3,'sending',$4,now())",[id(),recordId,JSON.stringify(packet('admin')),id()]);
  const call=vi.fn(async()=>({sent:true}));
  expect(await deliverFormNotifications(fixture.db,recordId,{bridge:{call}})).toMatchObject({delivered:0,review:1,pending:0});
  expect(call).not.toHaveBeenCalled();
 });

 it('requires submitted ownership context and keeps outbox work in the caller transaction',async()=>{
  await fixture.db.query("UPDATE portal_form_records SET status='draft' WHERE id=$1",[recordId]);
  await expect(enqueue()).rejects.toThrow();
  await fixture.db.query("UPDATE portal_form_records SET status='submitted' WHERE id=$1",[recordId]);
  await expect(fixture.db.transaction(async tx=>{await enqueueFormNotifications(tx,recordId);throw new Error('Rollback');})).rejects.toThrow('Rollback');
  expect((await fixture.db.query('SELECT * FROM portal_form_notification_runs')).rows).toHaveLength(0);
  await enqueue();await fixture.db.query('UPDATE portal_form_records SET owner_id=NULL WHERE id=$1',[recordId]);
  const call=vi.fn(async()=>[]);
  await expect(deliverFormNotifications(fixture.db,recordId,{bridge:{call}})).rejects.toThrow();expect(call).not.toHaveBeenCalled();
 });

 it('materializes only configured ready owned attachments and keeps private paths out of the plan',async()=>{
  const fileId=await addFile();await enqueue();let mailed=false;
  const bridge:NotificationBridge={async call(action,input){if(action==='notification-plan'){expect(input.verifiedFileDescriptors).toEqual([expect.objectContaining({fileId,fieldId:'upload-1',checksum})]);return [packet('admin',['upload-1'])];}
   const [attachment]=input.attachments as {path:string;filename:string}[];expect(attachment.path.startsWith(folder)).toBe(true);expect(attachment.path).not.toContain('../');expect((await readFile(attachment.path)).equals(bytes)).toBe(true);mailed=true;return {sent:true};}};
  await deliverFormNotifications(fixture.db,recordId,{bridge,store:store(),mailTempRoot:folder});expect(mailed).toBe(true);
  const plan=JSON.stringify((await fixture.db.query('SELECT context,payload FROM portal_form_notification_runs r JOIN portal_form_notification_deliveries d USING(record_id)')).rows);
  expect(plan).not.toContain(folder);expect(await readdir(folder)).toEqual([]);
 });

 it('refuses storage paths from another record',async()=>{
  await addFile({key:`submissions/${id()}/${id()}`});await enqueue();let mails=0;
  const bridge:NotificationBridge={async call(action){if(action==='notification-plan')return [packet('admin',['upload-1'])];mails++;return {sent:true};}};
  expect(await deliverFormNotifications(fixture.db,recordId,{bridge,store:store(),mailTempRoot:folder})).toMatchObject({review:1});expect(mails).toBe(0);
 });

 it('does not send attachments whose retained bytes fail the immutable snapshot checksum',async()=>{
  await addFile();await enqueue();let mails=0;
  const bridge:NotificationBridge={async call(action){if(action==='notification-plan')return [packet('admin',['upload-1'])];mails++;return {sent:true};}};
  const tampered=Buffer.alloc(bytes.length,120);
  expect(await deliverFormNotifications(fixture.db,recordId,{bridge,store:store(tampered),mailTempRoot:folder})).toMatchObject({review:1});
  expect(mails).toBe(0);expect(await readdir(folder)).toEqual([]);
 });

 it('enforces the native 15 MiB attachment boundary before reading private storage',async()=>{
  await addFile({size:15*1024**2});await enqueue();let mails=0;
  const bridge:NotificationBridge={async call(action){if(action==='notification-plan')return [packet('admin',['upload-1'])];mails++;return {sent:true};}};
  const head=vi.fn(async()=>({ContentLength:15*1024**2,VersionId:'version-1',ETag:'etag-1'}));
  expect(await deliverFormNotifications(fixture.db,recordId,{bridge,store:{...store(),head},mailTempRoot:folder})).toMatchObject({review:1});
  expect(head).not.toHaveBeenCalled();expect(mails).toBe(0);
 });

 it('never attaches a file belonging to a different form record',async()=>{
  const other=id();await fixture.db.query("INSERT INTO portal_form_records(id,form_key,owner_id,reference,status,submitted_at) VALUES($1,'partner',$2,$3,'submitted',now())",[other,ownerId,other]);
  await addFile({recordId:other});await enqueue();let mails=0;
  const bridge:NotificationBridge={async call(action){if(action==='notification-plan')return [packet('admin',['upload-1'])];mails++;return {sent:true};}};
  await expect(deliverFormNotifications(fixture.db,recordId,{bridge,store:store(),mailTempRoot:folder})).rejects.toThrow();expect(mails).toBe(0);
 });

 it('keeps a successful SMTP attempt in review when durable confirmation fails',async()=>{
  await enqueue();let mails=0,failConfirmation=true;
  const bridge:NotificationBridge={async call(action){if(action==='notification-plan')return [packet('admin')];mails++;return {sent:true};}};
  const database={...fixture.db,query:async<T>(sql:string,params?:unknown[])=>{if(failConfirmation&&sql.includes("SET status='delivered'")){failConfirmation=false;throw new Error('Database connection lost');}return fixture.db.query<T>(sql,params);}};
  expect(await deliverFormNotifications(database,recordId,{bridge})).toMatchObject({review:1});
  await deliverFormNotifications(fixture.db,recordId,{bridge});expect(mails).toBe(1);
 });

 it('allows concurrent workers to claim each planned message only once',async()=>{
  await enqueue();let mails=0;
  const bridge:NotificationBridge={async call(action){if(action==='notification-plan')return [packet('admin')];mails++;await new Promise(resolve=>setTimeout(resolve,10));return {sent:true};}};
  await Promise.all([deliverFormNotifications(fixture.db,recordId,{bridge}),deliverFormNotifications(fixture.db,recordId,{bridge})]);expect(mails).toBe(1);
 });

 it('uses a fixed physical basename while preserving long Unicode display filenames',async()=>{
  const filename='学'.repeat(200)+'.pdf';await addFile();
  await fixture.db.query('UPDATE portal_form_files SET filename=$2 WHERE record_id=$1',[recordId,filename]);await enqueue();
  let attachment:{path:string;filename:string}|undefined;
  const bridge:NotificationBridge={async call(action,input){if(action==='notification-plan')return [packet('admin',['upload-1'])];[attachment]=input.attachments as {path:string;filename:string}[];return {sent:true};}};
  expect(await deliverFormNotifications(fixture.db,recordId,{bridge,store:store(),mailTempRoot:folder})).toMatchObject({delivered:1});
  expect(attachment?.filename).toBe(filename);expect(basename(attachment!.path)).toBe('retained-file');
 });

 it('retries transient private-storage failures that occur before SMTP',async()=>{
  await addFile();await enqueue();let mails=0,unavailable=true;
  const bridge:NotificationBridge={async call(action){if(action==='notification-plan')return [packet('admin',['upload-1'])];mails++;return {sent:true};}};
  const retained=store();const head:typeof retained.head=async(...args)=>{if(unavailable){unavailable=false;throw new Error('Temporarily unavailable');}return retained.head(...args);};
  await expect(deliverFormNotifications(fixture.db,recordId,{bridge,store:{...retained,head},mailTempRoot:folder})).rejects.toThrow();
  expect((await fixture.db.query('SELECT status FROM portal_form_notification_deliveries')).rows).toEqual([{status:'planned'}]);expect(mails).toBe(0);
  expect(await deliverFormNotifications(fixture.db,recordId,{bridge,store:{...retained,head},mailTempRoot:folder})).toMatchObject({delivered:1,review:0});expect(mails).toBe(1);
 });

 it.each([{status:412},{$metadata:{httpStatusCode:412}}])('requires review when a pinned storage identity rejects its precondition %j',async(failure)=>{
  await addFile();await enqueue();let mails=0;
  const bridge:NotificationBridge={async call(action){if(action==='notification-plan')return [packet('admin',['upload-1'])];mails++;return {sent:true};}};
  const retained=store();const read:typeof retained.read=async()=>{throw failure;};
  expect(await deliverFormNotifications(fixture.db,recordId,{bridge,store:{...retained,read},mailTempRoot:folder})).toMatchObject({review:1});expect(mails).toBe(0);
 });
});
