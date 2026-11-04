import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Db } from './db';
import { AppError, audit, type Actor } from './core';
import { fingerprint } from './wordpress-migration';
import { referenceForms, plainText, isFieldVisible } from '../domain/wordpress-forms';

type SourceRecord = { id:string; source:string; source_id:string; checksum:string; payload:Record<string,unknown> };
function verify(record:SourceRecord) {
 if (fingerprint(record.payload)!==record.checksum) throw new AppError(409,'Archived source checksum does not verify.');
}
function reference(value:unknown):string {
 if(typeof value!=='string'||!value.trim()||value.trim().length>100)throw new AppError(422,'Explicit school reference is required.');
 return value.trim().toUpperCase();
}
const text=(value:unknown)=>typeof value==='string'?plainText(value):'';
function schoolReferences(record:SourceRecord){
 verify(record);
 const canonical=reference(record.payload.reference);
 if(canonical!==reference(record.source_id))throw new AppError(409,'School source identity conflicts with its canonical reference.');
 const rawAliases=record.payload.legacy_ids??[];
 if(!Array.isArray(rawAliases))throw new AppError(422,'School aliases must be explicit references.');
 return {canonical,aliases:[...new Set([canonical,...rawAliases.map(reference)])]};
}

/** Default is a preview. Identity matching uses permanent references only. */
export async function projectWordPressSchools(db:Db,source:string,options:{commit?:boolean}={}) {
 z.url().parse(source);
 return db.transaction(async tx=>{
  if(options.commit)await tx.query('LOCK TABLE wordpress_records,wordpress_school_links,schools,school_identifiers IN EXCLUSIVE MODE');
  const {rows:records}=await tx.query<SourceRecord>("SELECT * FROM wordpress_records WHERE source=$1 AND kind='school' ORDER BY source_id",[source]);
  const {rows:identifiers}=await tx.query<{reference:string;school_id:string}>('SELECT reference,school_id FROM school_identifiers');
  const references=new Map(identifiers.map(row=>[reference(row.reference),row.school_id]));
  const {rows:schools}=await tx.query<{id:string;reference:string}>('SELECT id,reference FROM schools');
  const canonicalReferences=new Map(schools.map(school=>[reference(school.reference),school.id]));
  for(const school of schools){const key=reference(school.reference);if(references.has(key)&&references.get(key)!==school.id)throw new AppError(409,'School identity conflict.');references.set(key,school.id);}
  const {rows:links}=await tx.query<{record_id:string;school_id:string;source_checksum:string}>('SELECT * FROM wordpress_school_links');
  const linked=new Map(links.map(link=>[link.record_id,link]));
  const {rows:retained}=await tx.query<SourceRecord&{source_checksum:string}>("SELECT r.*,l.source_checksum FROM wordpress_school_links l JOIN wordpress_records r ON r.id=l.record_id WHERE r.kind='school'");
  const claims=new Map<string,string>();
  // Retain source ownership across runs and origins, even if a directory alias
  // was removed. A canonical reference must never inherit an alias's target.
  for(const record of [...retained,...records]){
   const {canonical,aliases}=schoolReferences(record);
   if('source_checksum' in record&&record.source_checksum!==record.checksum)throw new AppError(409,'School source checksum conflict.');
   for(const alias of aliases){
    const owner=claims.get(alias);
    if(owner&&owner!==canonical)throw new AppError(409,'School canonical or alias ownership conflict; no records were merged.');
    claims.set(alias,canonical);
   }
  }
  const result={ready:0,unchanged:0,created:0,linked:0,aliases:0,committed:!!options.commit};
  // Complete preflight, including aliases from this batch, before writing.
  const plans=[];
  for(const record of records){
   const {canonical,aliases}=schoolReferences(record);
   const old=linked.get(record.id);
   if(old&&old.source_checksum!==record.checksum)throw new AppError(409,'School source checksum conflict.');
   const matched=canonicalReferences.get(canonical);
   const schoolId=old?.school_id??matched??randomUUID();
   if(matched&&matched!==schoolId)throw new AppError(409,'School reference conflict.');
   for(const alias of aliases)if(references.has(alias)&&references.get(alias)!==schoolId)throw new AppError(409,'School alias conflict; no records were merged.');
   const create=!old&&!matched;
   if(create&&!text(record.payload.name))throw new AppError(422,'School name is required.');
   const status=record.payload.status??'active';
   if(create&&!['active','pending','inactive'].includes(String(status)))throw new AppError(422,'Invalid source school status.');
   const missing=aliases.filter(alias=>!references.has(alias));
   for(const alias of aliases)references.set(alias,schoolId);
   canonicalReferences.set(canonical,schoolId);
   if(old)result.unchanged++;else result.ready++;
   plans.push({record,canonical,schoolId,create,status,missing,old});
  }
  if(!options.commit)return result;
  for(const plan of plans){
   const {record,canonical,schoolId,create,status,missing,old}=plan;
   if(create){await tx.query('INSERT INTO schools(id,reference,name,address,city,state,postal_code,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[schoolId,canonical,text(record.payload.name),text(record.payload.address),text(record.payload.city),text(record.payload.state),text(record.payload.postal_code),status]);result.created++;}
   // The school insert trigger retains its canonical identifier.
   for(const alias of missing){if(create&&alias===canonical)continue;await tx.query("INSERT INTO school_identifiers(reference,school_id,kind) VALUES($1,$2,'imported')",[alias,schoolId]);result.aliases++;}
   if(!old){await tx.query('INSERT INTO wordpress_school_links(record_id,school_id,source_checksum) VALUES($1,$2,$3)',[record.id,schoolId,record.checksum]);result.linked++;}
  }
  return result;
 });
}

const linkInput=z.object({source:z.url(),sourceId:z.string().min(1).max(250),authUserId:z.uuid()});
function sourceEmail(record:SourceRecord){const email=record.payload.user_email;return typeof email==='string'?email.trim().toLowerCase():'';}
export async function linkWordPressUser(db:Db,actor:Actor,input:z.infer<typeof linkInput>){
 if(actor.role!=='owner')throw new AppError(403,'Owner access required.');
 const data=linkInput.parse(input);
 return db.transaction(async tx=>{
  // Serialize the authorization check with role/identity revocations and claims.
  await tx.query('LOCK TABLE users,supabase_identities,wordpress_records,wordpress_user_links IN EXCLUSIVE MODE');
  const {rows:[owner]}=await tx.query("SELECT id FROM users WHERE id=$1 AND role='owner' AND active=true",[actor.id]);
  if(!owner)throw new AppError(403,'Active owner access required.');
  const {rows:[record]}=await tx.query<SourceRecord>("SELECT * FROM wordpress_records WHERE source=$1 AND kind='user' AND source_id=$2",[data.source,data.sourceId]);
  if(!record)throw new AppError(404,'Archived source user not found.');
  verify(record);
  const {rows:[identity]}=await tx.query('SELECT i.*,u.role,u.active,u.contact FROM supabase_identities i JOIN users u ON u.id=i.user_id WHERE i.auth_user_id=$1',[data.authUserId]);
  const {rows:[old]}=await tx.query('SELECT * FROM wordpress_user_links WHERE record_id=$1',[record.id]);
  if(old&&(old.auth_user_id!==data.authUserId||old.user_id!==identity?.user_id||old.source_checksum!==record.checksum))throw new AppError(409,'Archived user is already linked; claims cannot be reassigned.');
  if(!identity||identity.role!=='participant'||!identity.active||!sourceEmail(record)||sourceEmail(record)!==String(identity.verified_contact).trim().toLowerCase()||sourceEmail(record)!==String(identity.contact).trim().toLowerCase())throw new AppError(422,'A matching verified participant identity is required.');
  const {rows:[other]}=await tx.query('SELECT l.record_id FROM wordpress_user_links l JOIN wordpress_records r ON r.id=l.record_id WHERE l.user_id=$1 AND r.source=$2 AND l.record_id<>$3',[identity.user_id,data.source,record.id]);
  if(other)throw new AppError(409,'Participant already claims a different user from this source.');
  if(!old){
   await tx.query('INSERT INTO wordpress_user_links(record_id,user_id,auth_user_id,source_checksum,linked_by) VALUES($1,$2,$3,$4,$5)',[record.id,identity.user_id,data.authUserId,record.checksum,actor.id]);
   await audit(tx,actor,'wordpress.user.link','wordpress_record',record.id,{userId:identity.user_id,sourceChecksum:record.checksum});
  }
  return {userId:identity.user_id,linked:true,unchanged:!!old};
 });
}

type Meta={meta_key:string;meta_value:unknown};
function metadata(record:SourceRecord):Meta[]{return Array.isArray(record.payload.meta)?record.payload.meta.filter((item):item is Meta=>!!item&&typeof item==='object'&&typeof item.meta_key==='string'):[];}
function entryOwner(record:SourceRecord){
 const pointers=metadata(record).filter(item=>['_yes_entry_account_id','_yes_owner_user_id'].includes(item.meta_key));
 if(!pointers.length)return null;
 const values=pointers.map(item=>typeof item.meta_value==='string'||typeof item.meta_value==='number'?String(item.meta_value).trim():'');
 // Empty, ambiguous, duplicate-disagreeing pointers all fail closed.
 return values.every(value=>value&&value===values[0])?values[0]:null;
}
const allowedTypes=new Set(['text','name','email','phone','textarea','number','select','radio','checkbox','date','time','url','consent','address']);
function safeValue(raw:unknown):string|number|boolean|string[]|undefined {
 if(typeof raw==='string')return plainText(raw).slice(0,20000);
 if(typeof raw==='number'&&Number.isFinite(raw)||typeof raw==='boolean')return raw as number|boolean;
 if(Array.isArray(raw)&&raw.length<=100&&raw.every(value=>typeof value==='string'||typeof value==='number'))return raw.map(value=>plainText(value).slice(0,20000));
 return undefined;
}
function present(record:SourceRecord){
 const form=referenceForms.find(form=>String(form.id)===String(record.payload.form_id));
 const answers:Record<string,unknown>=Object.create(null);
 for(const item of metadata(record)){const value=safeValue(item.meta_value);if(value!==undefined)answers[item.meta_key]=value;}
 const fields=(form?.fields??[]).filter(field=>allowedTypes.has(field.type)&&!field.id.startsWith('_')&&!/password|upload|hidden/i.test(field.id)&&isFieldVisible(field,answers)).flatMap(field=>{
  const value=safeValue(answers[field.id]);return value===undefined?[]:[{id:field.id,label:plainText(field.field_label||field.id),value}];
 });
 const formTitle=form?plainText(form.title):'Historical entry';
 return {id:record.id,sourceId:record.source_id,formKey:form?.key??null,title:formTitle,formTitle,status:text(record.payload.status),createdAt:text(record.payload.date_created),fields};
}
type HistoricalFile={id:string;entry_record_id:string;storage_key:string;filename:string;mime_type:string;byte_size:number|string};
const fileName=(value:string)=>plainText(value.split(/[/\\]/).pop()||'Attachment').slice(0,250);
async function authorizedHistory(db:Db,actor:Actor,entryId?:string){
 if(actor.role!=='participant')return [];
 const {rows:links}=await db.query<SourceRecord&{source_checksum:string;verified_contact:string;contact:string}>("SELECT r.*,l.source_checksum,i.verified_contact,u.contact FROM wordpress_user_links l JOIN wordpress_records r ON r.id=l.record_id JOIN supabase_identities i ON i.auth_user_id=l.auth_user_id AND i.user_id=l.user_id JOIN users u ON u.id=l.user_id WHERE l.user_id=$1 AND u.role='participant' AND u.active=true",[actor.id]);
 const identities=new Map<string,Set<string>>();
 for(const link of links){if(link.source_checksum!==link.checksum||fingerprint(link.payload)!==link.checksum||!sourceEmail(link)||sourceEmail(link)!==link.verified_contact.trim().toLowerCase()||sourceEmail(link)!==link.contact.trim().toLowerCase())continue;const ids=identities.get(link.source)??new Set<string>();ids.add(link.source_id);identities.set(link.source,ids);}
 if(!identities.size)return [];
 const {rows:entries}=await db.query<SourceRecord>("SELECT * FROM wordpress_records WHERE kind='entry' AND source=ANY($1::text[])"+(entryId?' AND id=$2':'')+' ORDER BY source_id',entryId?[[...identities.keys()],entryId]:[[...identities.keys()]]);
 const authorized=entries.filter(entry=>fingerprint(entry.payload)===entry.checksum&&identities.get(entry.source)?.has(entryOwner(entry)??''));
 const {rows:files}=await db.query<HistoricalFile>('SELECT a.* FROM wordpress_attachments a JOIN wordpress_records r ON r.id=a.entry_record_id AND r.source=a.source WHERE a.entry_record_id=ANY($1::uuid[]) AND a.verified_at IS NOT NULL',[authorized.map(entry=>entry.id)]);
 return authorized.map(entry=>({...present(entry),attachments:files.filter(file=>file.entry_record_id===entry.id).map(file=>({id:file.id,filename:fileName(file.filename),mimeType:file.mime_type,bytes:Number(file.byte_size)}))}));
}
export async function historicalEntries(db:Db,actor:Actor){return {items:await authorizedHistory(db,actor)};}
export async function historicalEntry(db:Db,actor:Actor,entryId:string){
 if(!z.uuid().safeParse(entryId).success)throw new AppError(404,'Historical entry not found.');
 const [entry]=await authorizedHistory(db,actor,entryId);
 if(!entry)throw new AppError(404,'Historical entry not found.');
 return entry;
}
/** Internal download authorization only. The storage key never enters history JSON. */
export async function historicalAttachment(db:Db,actor:Actor,attachmentId:string){
 if(!z.uuid().safeParse(attachmentId).success)throw new AppError(404,'Historical file not found.');
 const {rows:[file]}=await db.query<HistoricalFile>('SELECT a.* FROM wordpress_attachments a JOIN wordpress_records r ON r.id=a.entry_record_id AND r.source=a.source WHERE a.id=$1 AND a.verified_at IS NOT NULL',[attachmentId]);
 if(!file)throw new AppError(404,'Historical file not found.');
 const entry=await historicalEntry(db,actor,file.entry_record_id);
 if(!entry.attachments.some(attachment=>attachment.id===file.id))throw new AppError(404,'Historical file not found.');
 return {storage_key:file.storage_key,filename:fileName(file.filename),mime_type:file.mime_type};
}
