import type {Db} from './db';
import {AppError,type Actor} from './core';
import {referenceForms,plainText,formTitle} from '../domain/wordpress-forms';
import {fingerprint} from './wordpress-migration';
import {validSourceDate} from '../domain/source-dates';
import {z} from 'zod';

export type SubmissionRecord={id:string;source:'portal'|'wordpress';sourceChecksum:string;ownerIdentity:string|null;submitterRole:string|null;emails:Record<string,string>;formKey:string;title:string;kind:'competition'|'student'|'teacher'|'school'|'other';status:'submitted'|'draft'|'other';reference:string;submittedAt:string|null;year:string|null;schoolId:string|null;name:string;email:string;className:string;section:string;answers:Record<string,unknown>};
export async function requireActive(db:Db,actor:Actor,roles:readonly string[]){
 if(!roles.includes(actor.role))throw new AppError(403,'This account does not have access to this workspace.');
 const {rows}=await db.query('SELECT id FROM users WHERE id=$1 AND role=$2 AND active=true FOR SHARE',[actor.id,actor.role]);
 if(!rows.length)throw new AppError(401,'Your account or permissions changed. Sign in again.');
}
const text=(v:unknown)=>typeof v==='string'||typeof v==='number'?plainText(v).trim():'';
const emailSchema=z.email();
const name=(v:unknown)=>v&&typeof v==='object'&&!Array.isArray(v)?['first-name','middle-name','last-name'].map(k=>text((v as Record<string,unknown>)[k])).filter(Boolean).join(' '):text(v);
function originalDate(value:unknown){
 const raw=value instanceof Date?value.toISOString():typeof value==='string'?value.trim():'';
 return validSourceDate(raw)?raw:null;
}
/** Server-only read model. Never return answers from a school-scoped endpoint. */
export async function loadSubmissionRecords(db:Db,only?:{source?:'portal'|'wordpress';recordId?:string;schoolId?:string}):Promise<SubmissionRecord[]>{
 const ids=referenceForms.map(f=>String(f.id));
 const nativeArgs:string[]=[],nativeWhere:string[]=[];
 if(only?.recordId){nativeArgs.push(only.recordId);nativeWhere.push(`id=$${nativeArgs.length}`);}
 if(only?.schoolId){nativeArgs.push(only.schoolId);nativeWhere.push(`school_id=$${nativeArgs.length}`);}
 const archiveArgs:unknown[]=[ids],archiveWhere=["kind='entry'","payload->>'form_id'=ANY($1::text[])"];
 if(only?.recordId){archiveArgs.push(only.recordId);archiveWhere.push(`id=$${archiveArgs.length}`);}
 if(only?.schoolId){archiveArgs.push(only.schoolId);archiveWhere.push(`EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(payload->'meta')='array' THEN payload->'meta' ELSE '[]'::jsonb END) m WHERE m->>'meta_key' IN ('text-yes-school-id','registered-school-id','_yes_school_id') AND upper(btrim(m->>'meta_value')) IN (SELECT reference FROM school_identifiers WHERE school_id=$${archiveArgs.length}::uuid))`);}
 const {rows:native}=only?.source==='wordpress'?{rows:[]}:await db.query('SELECT id,form_key,reference,answers,status,school_id,submitted_at,owner_id,submitter_role FROM portal_form_records'+(nativeWhere.length?' WHERE '+nativeWhere.join(' AND '):''),nativeArgs);
 const {rows:archive}=only?.source==='portal'?{rows:[]}:await db.query('SELECT id,source,source_id,payload,checksum FROM wordpress_records WHERE '+archiveWhere.join(' AND '),archiveArgs);
 const {rows:identifiers}=await db.query("SELECT i.reference,i.school_id FROM school_identifiers i JOIN schools s ON s.id=i.school_id WHERE s.trashed_at IS NULL AND NOT s.purging");
 const schools=new Map<string,string>(identifiers.map(i=>[String(i.reference).trim().toUpperCase(),String(i.school_id)]));
 const project=(row:any,source:'portal'|'wordpress'):SubmissionRecord|null=>{
  const form=source==='portal'?referenceForms.find(f=>f.key===row.form_key):referenceForms.find(f=>String(f.id)===String(row.payload.form_id));
  if(!form)return null;
  if(source==='wordpress'&&fingerprint(row.payload)!==row.checksum)throw new AppError(409,'A preserved submission failed its integrity check. Contact the summit team.');
  const answers:Record<string,unknown>=source==='portal'?row.answers||{}:Object.fromEntries((Array.isArray(row.payload.meta)?row.payload.meta:[]).filter((m:any)=>m&&typeof m.meta_key==='string').map((m:any)=>[m.meta_key,m.meta_value]));
  const originalValues=(field:string):unknown[]=>source==='portal'?(answers[field]===undefined?[]:[answers[field]]):(Array.isArray(row.payload.meta)?row.payload.meta:[]).filter((m:any)=>m?.meta_key===field).map((m:any)=>m.meta_value);
  const emails:Record<string,string>={};
  for(const field of form.fields.filter(f=>f.type==='email')){
   const values=originalValues(field.id).map(v=>typeof v==='string'?v.trim().toLowerCase():'');
   emails[field.id]=values.length&&values.every(v=>v===values[0]&&emailSchema.safeParse(v).success)?values[0]:'';
  }
  const ownerIds=['_yes_owner_user_id','_yes_entry_account_id'].flatMap(originalValues).map(v=>typeof v==='number'||typeof v==='string'?String(v).trim():'');
  const ownerIdentity=source==='portal'?(row.owner_id?'portal:'+row.owner_id:null):ownerIds.length&&ownerIds.every(v=>/^[1-9]\d*$/.test(v)&&v===ownerIds[0])?'wordpress:'+row.source+':'+ownerIds[0]:null;
  const roleValues=[...(source==='portal'&&row.submitter_role?[row.submitter_role]:[]),...originalValues('hidden-yes-submitter')].map(v=>typeof v==='string'?v.trim():'');
  const submitterRole=roleValues.length&&roleValues.every(v=>['student','educator'].includes(v)&&v===roleValues[0])?roleValues[0]:null;
  const draft=source==='wordpress'?row.payload.is_draft:null;
  const nonDraft=draft===undefined||draft===null||draft===false||draft===0||typeof draft==='string'&&['','0','false'].includes(draft.trim().toLowerCase());
  const status:SubmissionRecord['status']=source==='portal'?(row.status==='submitted'?'submitted':row.status==='draft'?'draft':'other'):!nonDraft?'draft':['active','submitted','completed'].includes(row.payload.status)?'submitted':'other';
  const submittedAt=originalDate(source==='portal'?row.submitted_at:row.payload.date_created);
  const pointerKeys=['text-yes-school-id','registered-school-id','_yes_school_id'];
  // Inspect every source occurrence before collapsing metadata. HTML is not an ID.
  const pointers:unknown[]=source==='wordpress'?(Array.isArray(row.payload.meta)?row.payload.meta:[]).filter((m:any)=>pointerKeys.includes(m?.meta_key)).map((m:any)=>m.meta_value):pointerKeys.filter(k=>answers[k]!==undefined).map(k=>answers[k]);
  const schoolRefs=pointers.map((v:unknown)=>typeof v==='string'?v.trim().toUpperCase():'');
  const linked=[...new Set(schoolRefs.map(ref=>schools.get(ref)).filter((s):s is string=>!!s))];
  const schoolId=source==='portal'?(row.school_id?String(row.school_id):null):linked.length===1&&schoolRefs.every(ref=>schools.has(ref))?linked[0]:null;
  const historicalKinds:Record<string,SubmissionRecord['kind']>={'legacy-48413':'student','legacy-28713':'student','legacy-28734':'teacher'};
  const kind:SubmissionRecord['kind']=form.competition?'competition':['student','teacher','school'].includes(form.key)?form.key as 'student'|'teacher'|'school':historicalKinds[form.key]||'other';
  const year=submittedAt?(source==='portal'?new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Kolkata'}).format(new Date(submittedAt)):submittedAt.slice(0,4)):null;
  return {id:row.id,source,sourceChecksum:source==='wordpress'?row.checksum:fingerprint({answers,formKey:form.key,schoolId,ownerIdentity,submitterRole,submittedAt}),ownerIdentity,submitterRole,emails,formKey:form.key,title:formTitle(form),kind,status,reference:source==='portal'?row.reference:`WP-${row.source_id}`,submittedAt,year,schoolId,
   name:name(answers['text-yes-name']||answers['name-1']||answers['text-1']||answers['name-2']),email:emails[form.competition?'email-yes-student-1':'email-1']||'',className:text(answers['select-yes-class'])||name(answers['name-6']),section:text(answers['text-yes-section']||answers['section']),answers};
 };
 return [...native.map(row=>project(row,'portal')),...archive.map(row=>project(row,'wordpress'))].filter((r):r is SubmissionRecord=>!!r);
}
export function recordLink(record:Pick<SubmissionRecord,'source'|'id'|'formKey'>){return record.source==='wordpress'?`/history/${encodeURIComponent(record.id)}`:`/forms/${encodeURIComponent(record.formKey)}#saved=${encodeURIComponent(record.id)}`;}
