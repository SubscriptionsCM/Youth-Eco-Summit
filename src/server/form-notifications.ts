import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, open, realpath, rm } from 'node:fs/promises';
import { isAbsolute, join, parse, relative, resolve } from 'node:path';
import { z } from 'zod';
import type { Db } from './db';
import { AppError, id } from './core';
import { referenceForms } from '../domain/wordpress-forms';
import { environmentWordPressBridge } from './wordpress-auth';
import { objectStore, type ObjectStore } from './storage/provider';

export interface NotificationBridge {
 call(action:'notification-plan'|'notification-mail',input:Record<string,unknown>):Promise<unknown>;
}
export type NotificationOptions = { bridge?:NotificationBridge; store?:Pick<ObjectStore,'head'|'read'>; mailTempRoot?:string };
type Summary = {delivered:number;review:number;pending:number};
const fieldId = z.string().regex(/^[A-Za-z0-9_-]{1,150}$/);
const fileDescriptorSchema = z.object({fieldId,fileId:z.uuid(),filename:z.string().min(1).max(255),byteSize:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),checksum:z.string().regex(/^[a-f0-9]{64}$/),mimeType:z.string().regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i)}).strict();
type FileDescriptor = z.infer<typeof fileDescriptorSchema>;
const contextSchema = z.object({formId:z.number().int().positive(),recordId:z.uuid(),reference:z.string().min(1).max(250),submittedAt:z.iso.datetime(),normalizedAnswers:z.record(z.string(),z.unknown()),portalOrigin:z.url(),verifiedFileDescriptors:z.array(fileDescriptorSchema).max(100)}).strict();
type Context = z.infer<typeof contextSchema>;
const packetSchema = z.object({notificationSlug:z.string().regex(/^[A-Za-z0-9_-]{1,200}$/),recipients:z.array(z.string().min(1).max(1000).refine(value=>!/[\r\n\0]/.test(value))).min(1).max(100),subject:z.string().max(2000).refine(value=>!/[\r\n\0]/.test(value)),body:z.string().max(524288),headers:z.array(z.string().max(4096)).max(100),attachmentFieldIds:z.array(fieldId).max(100)}).strict();
type Packet = z.infer<typeof packetSchema>;
type Run = {record_id:string;owner_id:string|null;context:Context;planned_at:string|null};
type Delivery = {id:string;ordinal:number;notification_slug:string;payload:Packet;status:string};
const MAX_ATTACHMENT_BYTES = 15 * 1024 ** 2;
const unavailable = () => new AppError(503,'Submitted form notifications are temporarily unavailable.');
const reviewReason = 'Delivery confirmation or attachment verification requires operator review. Automatic resending is disabled.';
class AttachmentIntegrityError extends Error {}

function displayFilename(value:string) {
 return value.toWellFormed().replace(/[\/\\\u0000-\u001F\u007F]/g,'_').slice(0,255).toWellFormed() || 'attachment';
}

function portalOrigin() {
 const url = new URL(process.env.APP_ORIGIN || '');
 if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))))throw unavailable();
 return url.origin;
}

/** The caller's final submission transaction owns both the run and its durable job. */
export async function enqueueFormNotifications(tx:Db,recordId:string):Promise<void> {
 z.uuid().parse(recordId);
 const {rows:[record]}=await tx.query('SELECT * FROM portal_form_records WHERE id=$1 FOR UPDATE',[recordId]);
 if(!record||record.status!=='submitted'||!record.submitted_at)throw new AppError(409,'Notifications require a submitted form.');
 const form=record.form_snapshot || referenceForms.find(form=>form.key===record.form_key);
 if(!form||!Number.isSafeInteger(form.id)||form.id<1||(form.key&&form.key!==record.form_key))throw unavailable();
 const {rows:files}=await tx.query("SELECT * FROM portal_form_files WHERE record_id=$1 AND status='ready' ORDER BY field_id,id FOR SHARE",[recordId]);
 const descriptors=files.map(file=>fileDescriptorSchema.parse({fieldId:file.field_id,fileId:file.id,filename:displayFilename(file.filename),byteSize:Number(file.expected_size),checksum:file.expected_checksum,mimeType:file.mime_type}));
 const answers={...record.answers};
 for(const field of form.fields || [])if(field.type==='upload')delete answers[field.id];
 for(const file of descriptors)answers[file.fieldId]={id:file.fileId,filename:file.filename,checksum:file.checksum,bytes:file.byteSize};
 const context=contextSchema.parse({formId:form.id,recordId,reference:record.reference,submittedAt:new Date(record.submitted_at).toISOString(),normalizedAnswers:answers,portalOrigin:portalOrigin(),verifiedFileDescriptors:descriptors});
 const inserted=await tx.query('INSERT INTO portal_form_notification_runs(record_id,owner_id,context) VALUES($1,$2,$3) ON CONFLICT(record_id) DO NOTHING RETURNING record_id',[recordId,record.owner_id,JSON.stringify(context)]);
 if(inserted.rows.length)await tx.query("INSERT INTO jobs(id,kind,payload) VALUES($1,'form_notifications',$2)",[id(),JSON.stringify({recordId})]);
}

async function runContext(database:Db,recordId:string):Promise<Run> {
 const {rows:[run]}=await database.query<Run & {status:string;current_owner:string|null}>(`SELECT n.*,r.status,r.owner_id AS current_owner FROM portal_form_notification_runs n JOIN portal_form_records r ON r.id=n.record_id WHERE n.record_id=$1`,[recordId]);
 if(!run||run.status!=='submitted'||run.owner_id!==run.current_owner)throw new AppError(409,'Submitted notification ownership could not be verified.');
 return {...run,context:contextSchema.parse(run.context)};
}

async function planNotifications(database:Db,run:Run,bridge:NotificationBridge) {
 if(run.planned_at)return;
 let packets:Packet[];
 try {
  const result=await bridge.call('notification-plan',run.context);
  if(Buffer.byteLength(JSON.stringify(result) || '')>1048576)throw unavailable();
  packets=z.array(packetSchema).max(100).parse(result);
  const fields=new Set(run.context.verifiedFileDescriptors.map(file=>file.fieldId));
  if(packets.some(packet=>new Set(packet.attachmentFieldIds).size!==packet.attachmentFieldIds.length||packet.attachmentFieldIds.some(field=>!fields.has(field))))throw unavailable();
 }catch{throw unavailable();}
 await database.transaction(async tx=>{
  const {rows:[locked]}=await tx.query<Run>('SELECT * FROM portal_form_notification_runs WHERE record_id=$1 FOR UPDATE',[run.record_id]);
  if(!locked||locked.planned_at)return;
  for(let ordinal=1;ordinal<=packets.length;ordinal++) {
   const packet=packets[ordinal-1];
   await tx.query('INSERT INTO portal_form_notification_deliveries(id,record_id,ordinal,notification_slug,payload) VALUES($1,$2,$3,$4,$5)',[id(),run.record_id,ordinal,packet.notificationSlug,JSON.stringify(packet)]);
  }
  await tx.query('UPDATE portal_form_notification_runs SET planned_at=now() WHERE record_id=$1',[run.record_id]);
 });
}

async function privateDirectory(root:string) {
 if(!isAbsolute(root))throw unavailable();
 const absolute=resolve(root),base=parse(absolute).root;
 let current=base;
 for(const segment of absolute.slice(base.length).split(/[\\/]/).filter(Boolean)) {
  current=join(current,segment);
  try{await mkdir(current,{mode:0o700});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
  const info=await lstat(current);
  if(!info.isDirectory()||info.isSymbolicLink())throw unavailable();
 }
 const canonical=await realpath(absolute);
 if((process.platform==='win32'?canonical.toLowerCase():canonical)!==(process.platform==='win32'?absolute.toLowerCase():absolute))throw unavailable();
 return absolute;
}

async function materializeAttachments(database:Db,context:Context,packet:Packet,options:NotificationOptions) {
 const selected=packet.attachmentFieldIds.map(field=>context.verifiedFileDescriptors.find(file=>file.fieldId===field));
 if(selected.some(file=>!file))throw new AttachmentIntegrityError();
 const descriptors=selected as FileDescriptor[];
 if(descriptors.reduce((sum,file)=>sum+file.byteSize,0)>=MAX_ATTACHMENT_BYTES)throw new AttachmentIntegrityError();
 if(!descriptors.length)return {attachments:[] as (FileDescriptor & {path:string})[],cleanup:async()=>{}};
 const configuredRoot=options.mailTempRoot || process.env.WORDPRESS_MAIL_TEMP_ROOT;
 if(!configuredRoot)throw unavailable();
 const root=await privateDirectory(configuredRoot),directory=await mkdtemp(join(root,'mail-'));
 const cleanup=async()=>{
  const within=relative(root,resolve(directory));
  if(!within||within.startsWith('..')||isAbsolute(within))throw unavailable();
  await rm(directory,{recursive:true,force:true});
 };
 try {
  const store=options.store || objectStore();
  const attachments:(FileDescriptor & {path:string})[]=[];
  for(const descriptor of descriptors) {
   const {rows:[file]}=await database.query('SELECT * FROM portal_form_files WHERE id=$1 AND record_id=$2 AND field_id=$3 AND status=\'ready\'',[descriptor.fileId,context.recordId,descriptor.fieldId]);
   if(!file||Number(file.expected_size)!==descriptor.byteSize||file.expected_checksum!==descriptor.checksum||file.mime_type!==descriptor.mimeType||file.storage_key!==`submissions/${context.recordId}/${descriptor.fileId}`)throw new AttachmentIntegrityError();
   const version=typeof file.metadata?.storageVersion==='string'?file.metadata.storageVersion:undefined;
   const etag=typeof file.metadata?.storageEtag==='string'?file.metadata.storageEtag:undefined;
   const identity=await store.head(file.storage_key,version);
   if(identity.ContentLength!==descriptor.byteSize||!(version||etag||identity.VersionId||identity.ETag))throw new AttachmentIntegrityError();
   const object=await store.read(file.storage_key,version || identity.VersionId,etag || identity.ETag);
   if(!object.Body)throw unavailable();
   try {
    const fileDirectory=join(directory,descriptor.fileId);await mkdir(fileDirectory,{mode:0o700});
    const path=join(fileDirectory,'retained-file'),handle=await open(path,'wx',0o600),hash=createHash('sha256');
    let bytes=0;
    try {
     for await(const chunk of object.Body) {
      if(!(chunk instanceof Uint8Array))throw new AttachmentIntegrityError();
      bytes+=chunk.byteLength;if(bytes>descriptor.byteSize||bytes>MAX_ATTACHMENT_BYTES)throw new AttachmentIntegrityError();
      hash.update(chunk);await handle.writeFile(chunk);
     }
     if(bytes!==descriptor.byteSize||hash.digest('hex')!==descriptor.checksum)throw new AttachmentIntegrityError();
     await handle.sync();
    }finally{await handle.close();}
    attachments.push({...descriptor,path});
   }finally{if('destroy' in object.Body&&typeof object.Body.destroy==='function')object.Body.destroy();}
  }
  return {attachments,cleanup};
 }catch(error){
  await cleanup();
  const providerError=error as {status?:number;$metadata?:{httpStatusCode?:number}}|undefined;
  if(providerError?.status===412||providerError?.$metadata?.httpStatusCode===412)throw new AttachmentIntegrityError();
  throw error;
 }
}

async function summarize(database:Db,recordId:string):Promise<Summary> {
 const {rows}=await database.query<{status:string;count:string}>('SELECT status,count(*)::text AS count FROM portal_form_notification_deliveries WHERE record_id=$1 GROUP BY status',[recordId]);
 const count=(status:string)=>Number(rows.find(row=>row.status===status)?.count || 0);
 return {delivered:count('delivered'),review:count('review')+count('sending'),pending:count('planned')};
}

/** A durable sending marker is committed before PHP can contact SMTP. */
export async function deliverFormNotifications(database:Db,recordId:string,options:NotificationOptions={}):Promise<Summary> {
 z.uuid().parse(recordId);
 const run=await runContext(database,recordId),bridge=options.bridge || environmentWordPressBridge();
 if(!bridge)throw unavailable();
 await planNotifications(database,run,bridge);
 // A recovered invocation never resends an attempt whose SMTP result is unknown.
 // A still-running attempt may confirm success using its own unchanged token.
 await database.query("UPDATE portal_form_notification_deliveries SET status='review',last_error=$2 WHERE record_id=$1 AND status='sending'",[recordId,reviewReason]);
 const {rows:deliveries}=await database.query<Delivery>("SELECT * FROM portal_form_notification_deliveries WHERE record_id=$1 AND status='planned' ORDER BY ordinal",[recordId]);
 for(const delivery of deliveries) {
  let prepared:Awaited<ReturnType<typeof materializeAttachments>>;
  try { prepared=await materializeAttachments(database,run.context,packetSchema.parse(delivery.payload),options); }
  catch(error) {
   if(!(error instanceof AttachmentIntegrityError))throw unavailable();
   await database.query("UPDATE portal_form_notification_deliveries SET status='review',last_error=$2 WHERE id=$1 AND status='planned'",[delivery.id,reviewReason]);continue;
  }
  const attempt=id();
  try {
   const claimed=await database.query("UPDATE portal_form_notification_deliveries SET status='sending',attempt_token=$2,sending_started_at=now(),last_error=NULL WHERE id=$1 AND status='planned' RETURNING id",[delivery.id,attempt]);
   if(!claimed.rows.length)continue;
   try {
    const result=await bridge.call('notification-mail',{...run.context,ordinal:delivery.ordinal,notificationSlug:delivery.notification_slug,payload:delivery.payload,attachments:prepared.attachments});
    if(!result||typeof result!=='object'||(result as {sent?:unknown}).sent!==true)throw unavailable();
    await database.query("UPDATE portal_form_notification_deliveries SET status='delivered',delivered_at=now(),last_error=NULL WHERE id=$1 AND attempt_token=$2 AND status IN ('sending','review')",[delivery.id,attempt]);
   }catch {
    await database.query("UPDATE portal_form_notification_deliveries SET status='review',last_error=$3 WHERE id=$1 AND attempt_token=$2 AND status IN ('sending','review')",[delivery.id,attempt,reviewReason]);
   }
  }finally{await prepared.cleanup();}
 }
 return summarize(database,recordId);
}
