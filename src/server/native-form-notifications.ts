import {createHash} from 'node:crypto';
import {lstat,readFile,realpath} from 'node:fs/promises';
import {basename,dirname,isAbsolute,relative,resolve} from 'node:path';
import {z} from 'zod';
import {type Db} from './db';
import {AppError} from './core';
import {fingerprint} from './wordpress-migration';
import {referenceForms,isFieldVisible,type ReferenceField} from '../domain/wordpress-forms';
import {sendTransactionalEmail} from './email';
import type {NotificationBridge} from './form-notifications';

type Context={formId:number;recordId:string;reference:string;submittedAt:string;normalizedAnswers:Record<string,unknown>;portalOrigin:string;verifiedFileDescriptors:{fieldId:string;fileId:string;filename:string;byteSize:number;checksum:string;mimeType:string}[]};
type Packet={notificationSlug:string;recipients:string[];subject:string;body:string;headers:string[];attachmentFieldIds:string[]};
const unavailable=()=>new AppError(503,'Submitted form notifications are temporarily unavailable.');
const escape=(value:unknown)=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
const text=(value:unknown):string=>Array.isArray(value)?value.map(text).join(', '):value&&typeof value==='object'?Object.values(value).map(text).filter(Boolean).join(', '):String(value??'');
const enabled=(value:unknown)=>value===true||value==='true'||value===1||value==='1';
function recipients(value:string){
 const items=value.split(/[,;\n]/).map(item=>item.trim()).filter(Boolean);
 if(!items.length||items.length>100||items.some(item=>!z.email().safeParse(item).success))throw unavailable();
 return [...new Set(items)];
}
function conditions(notification:Record<string,any>,answers:Record<string,unknown>){
 const rules=notification.conditions;
 if(!rules||Array.isArray(rules)&&!rules.length)return true;
 if(!Array.isArray(rules))throw unavailable();
 const matches=rules.map((rule:Record<string,unknown>)=>{
  const field=String(rule.element_id||rule.field||rule.field_id||''),operator=String(rule.rule||rule.operator||'is');
  const actual=answers[field],expected=String(rule.value??'');
  const values=Array.isArray(actual)?actual.map(text):[text(actual)];
  if(['is','equals'].includes(operator))return values.includes(expected);
  if(['is_not','not_equals'].includes(operator))return !values.includes(expected);
  if(operator==='contains')return values.some(value=>value.includes(expected));
  if(operator==='does_not_contain')return values.every(value=>!value.includes(expected));
  throw unavailable();
 });
 return notification.condition_rule==='any'?matches.some(Boolean):matches.every(Boolean);
}
export function nativeNotificationPackets(form:{post_title?:string;definition:Record<string,any>},context:Context):Packet[]{
 const definition=form.definition,reference=referenceForms.find(form=>form.id===context.formId);
 const fields=(definition.fields||[]).map((field:Record<string,any>)=>({...field,id:field.id||field.element_id})) as ReferenceField[];
 const visible=fields.filter(field=>!['password','captcha','recaptcha','html','group','page-break','section'].includes(field.type)&&isFieldVisible(field,context.normalizedAnswers));
 const files=new Map(context.verifiedFileDescriptors.map(file=>[file.fieldId,file]));
 const value=(id:string,html:boolean)=>{
  const file=files.get(id);
  if(file)return html?`<a href="${escape(context.portalOrigin)}/files/${file.fileId}">${escape(file.filename)}</a>`:file.filename;
  const raw=text(context.normalizedAnswers[id]);return html?escape(raw):raw;
 };
 const all=visible.map(field=>`<tr><th align="left">${escape(field.field_label||field.id)}</th><td>${value(field.id,true)}</td></tr>`).join('');
 const tags:Record<string,string>={form_name:form.post_title||definition.settings?.formName||reference?.title||'Youth Eco Summit',form_id:String(context.formId),submission_id:context.reference,
  site_url:context.portalOrigin,site_title:'Youth Eco Summit',submission_url:`${context.portalOrigin}/dashboard`,activation_url:`${context.portalOrigin}/login`,
  submission_date:new Date(context.submittedAt).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'}),submission_time:new Date(context.submittedAt).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata'}),user_ip:''};
 const render=(template:unknown,html=false)=>String(template??'').replace(/\{([^{}]+)\}/g,(_whole,key:string)=>{
  if(['all_fields','all_non_empty_fields'].includes(key))return html?`<table>${all}</table>`:visible.map(field=>`${field.field_label||field.id}: ${value(field.id,false)}`).join('\n');
  if(Object.hasOwn(tags,key))return html?escape(tags[key]):tags[key];
  const field=key.split(':')[0];
  if(fields.some(candidate=>candidate.id===field))return value(field,html);
  throw unavailable();
 });
 const notifications=definition.notifications||definition.email_notifications||[];
 if(!Array.isArray(notifications)||notifications.length>100)throw unavailable();
 const packets:Packet[]=[],slugs=new Set<string>();
 for(const notification of notifications){
  if(!notification||typeof notification!=='object'||notification.enabled===false||notification.enabled==='false'||!conditions(notification,context.normalizedAnswers))continue;
  if(notification['email-recipients']&&notification['email-recipients']!=='default'||notification.routing?.length||notification['email-pdfs']?.length)throw unavailable();
  const slug=String(notification.slug||'');if(!/^[A-Za-z0-9_-]{1,200}$/.test(slug)||slugs.has(slug))throw unavailable();slugs.add(slug);
  // The source mailer omits recipient fields removed from a form definition.
  const recipientTemplate=String(notification.recipients||'').replace(/\{(email-\d+)\}/g,(tag,key)=>fields.some(field=>field.id===key)?tag:'');
  const to=recipients(render(recipientTemplate)),subject=render(notification['email-subject']);
  if(!subject||/[\r\n\0]/.test(subject))throw unavailable();
  const headers=['Content-Type: text/html; charset=UTF-8'];
  for(const [key,label]of [['replyto-email','Reply-To'],['cc-email','Cc'],['bcc-email','Bcc']]as const){
   if(notification[key])headers.push(`${label}: ${recipients(render(notification[key])).join(', ')}`);
  }
  const body=render(notification['email-editor'],true);
  if(!body)throw unavailable();
  packets.push({notificationSlug:slug,recipients:to,subject,body,headers,attachmentFieldIds:enabled(notification['email-attachment'])?context.verifiedFileDescriptors.filter(file=>visible.some(field=>field.id===file.fieldId)).map(file=>file.fieldId):[]});
 }
 return packets;
}
async function currentForm(database:Db,formId:number){
 const {rows:[snapshot]}=await database.query("SELECT source,payload FROM wordpress_records WHERE kind='option' AND source_id LIKE 'native-current-forms:%' ORDER BY captured_at DESC,source_id DESC LIMIT 1");
 const checksum=snapshot?.payload?.forms?.[String(formId)];
 if(snapshot?.payload?.format!=='yes-native-form-snapshot/v1'||typeof checksum!=='string')throw unavailable();
 const {rows:[baseline]}=await database.query("SELECT id,payload,checksum FROM wordpress_records WHERE source=$1 AND kind='form' AND source_id=$2",[snapshot.source,String(formId)]);
 let current=baseline;
 if(baseline?.checksum!==checksum){
  if(!baseline)throw unavailable();
  const {rows}=await database.query("SELECT payload,checksum FROM wordpress_record_versions WHERE record_id=$1 AND checksum=$2",[baseline.id,checksum]);current=rows[0];
 }
 if(!current||current.checksum!==checksum||fingerprint(current.payload)!==checksum)throw unavailable();
 return current.payload as {post_title?:string;definition:Record<string,any>};
}
export function nativeNotificationBridge(database:Db):NotificationBridge{
 return {async call(action,input){
  const context=input as unknown as Context,form=await currentForm(database,context.formId),packets=nativeNotificationPackets(form,context);
  if(action==='notification-plan')return packets;
  const packet=packets[Number(input.ordinal)-1];
  if(!packet||packet.notificationSlug!==input.notificationSlug||fingerprint(packet)!==fingerprint(input.payload))throw unavailable();
  const provided=input.attachments as (Context['verifiedFileDescriptors'][number]&{path:string})[];
  if(!Array.isArray(provided)||provided.length!==packet.attachmentFieldIds.length)throw unavailable();
  const attachments: {filename:string;content:Buffer;contentType:string}[]=[];
  for(const field of packet.attachmentFieldIds){
   const expected=context.verifiedFileDescriptors.find(file=>file.fieldId===field),file=provided.find(file=>file.fieldId===field);
   if(!expected||!file||typeof file.path!=='string')throw unavailable();
   const {path,...descriptor}=file;if(fingerprint(descriptor)!==fingerprint(expected))throw unavailable();
   const root=process.env.MAIL_TEMP_ROOT;if(!root||!isAbsolute(root))throw unavailable();
   const canonical=await realpath(path),within=relative(resolve(root),canonical),info=await lstat(path);
   if(canonical!==path||!within||within.startsWith('..')||isAbsolute(within)||info.isSymbolicLink()||!info.isFile()||basename(path)!=='retained-file'||basename(dirname(path))!==file.fileId)throw unavailable();
   const content=await readFile(path);
   if(content.length!==file.byteSize||content.length>=15*1024**2||createHash('sha256').update(content).digest('hex')!==file.checksum)throw unavailable();
   attachments.push({filename:file.filename,content,contentType:file.mimeType});
  }
  const header=(name:string)=>packet.headers.find(value=>value.toLowerCase().startsWith(name.toLowerCase()+':'))?.slice(name.length+1).trim();
  await sendTransactionalEmail({to:packet.recipients,subject:packet.subject,body:packet.body.replace(/<[^>]*>/g,' '),html:packet.body,attachments,
   ...header('Reply-To')?{replyTo:recipients(header('Reply-To')!)[0]}:{},...header('Cc')?{cc:recipients(header('Cc')!)}:{},...header('Bcc')?{bcc:recipients(header('Bcc')!)}:{}});
  return {sent:true};
 }};
}
