import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Db } from './db';
import { AppError, id, audit, type Actor } from './core';
import { referenceForms, formSteps, validateReferenceAnswers, type Answers } from '../domain/wordpress-forms';
import { fingerprint } from './wordpress-migration';

export class FormValidationError extends AppError {
 constructor(public fields: Record<string,string>) { super(422,'Please check the highlighted information.'); }
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const saveSchema = z.object({answers:z.record(z.string(),z.unknown()),currentStep:z.number().int().min(0),lockVersion:z.number().int().min(0)}).strict();
export async function createFormRecord(db:Db,actor:Actor|null,input:unknown) {
 const { formKey,context={} } = z.object({formKey:z.string().max(100),context:z.record(z.string(),z.unknown()).optional()}).strict().parse(input);
 const form = referenceForms.find(form=>form.key===formKey);
 if (!form) throw new AppError(404,'Form not found.');
 const initial=validateReferenceAnswers(form,context,{final:false});
 if(Object.keys(initial.errors).length)throw new FormValidationError(initial.errors);
 if (form.key.startsWith('legacy-') && form.settings['form-type']==='registration') throw new AppError(503,'This historical account workflow needs reconciliation. Please use the current student or educator registration.');
 if ((form.competition || ['student','teacher'].includes(form.key)) && (!actor || actor.role!=='participant')) throw new AppError(401,'Sign in with your student or educator account first.');
 if (actor) {
  const {rows:[user]}=await db.query('SELECT id FROM users WHERE id=$1 AND active',[actor.id]);
  if(!user)throw new AppError(401,'Your account is unavailable.');
 }
 const token=randomBytes(32).toString('hex'),recordId=id();
 const {rows:[record]}=await db.query('INSERT INTO portal_form_records(id,form_key,owner_id,draft_token_hash,reference,answers) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[recordId,formKey,actor?.id??null,actor?null:hash(token),`YES-${form.id}-${recordId.slice(0,12).toUpperCase()}`,JSON.stringify(initial.answers)]);
 return {record:safeRecord(record),...(!actor?{token}:{})};
}
function safeRecord(record:Record<string,any>) { const {draft_token_hash,...safe}=record;return safe; }
async function owned(db:Db,actor:Actor|null,recordId:string,token?:string,lock=false) {
 z.uuid().parse(recordId);
 const {rows:[record]}=await db.query(`SELECT * FROM portal_form_records WHERE id=$1${lock?' FOR UPDATE':''}`,[recordId]);
 const owner=actor&&record?.owner_id===actor.id;
 const bearer=!record?.owner_id&&record?.draft_token_hash&&token&&hash(token)===record.draft_token_hash;
 if(!record||(!owner&&!bearer))throw new AppError(404,'Saved form not found. Sign in with its account or use the private saved-form link.');
 if(actor&&owner){const {rows}=await db.query('SELECT id FROM users WHERE id=$1 AND active',[actor.id]);if(!rows.length)throw new AppError(401,'Your account is unavailable.');}
 return record;
}
export async function getFormRecord(db:Db,actor:Actor|null,recordId:string,token?:string):Promise<Record<string,any>> {
 const record=await owned(db,actor,recordId,token);
 const {rows:files}=await db.query('SELECT id,field_id,filename,status,expected_size,mime_type,metadata FROM portal_form_files WHERE record_id=$1 ORDER BY created_at',[recordId]);
 return {...safeRecord(record),files};
}
export async function saveFormRecord(db:Db,actor:Actor|null,recordId:string,input:unknown,token?:string) {
 const v=saveSchema.parse(input);
 return db.transaction(async tx=>{
  const record=await owned(tx,actor,recordId,token,true);
  if(record.status!=='draft'||record.lock_version!==v.lockVersion)throw new AppError(409,'This form changed in another tab or was already submitted. Reload before continuing.');
  const form=referenceForms.find(f=>f.key===record.form_key)!;
  if(v.currentStep>=formSteps(form).length)throw new AppError(422,'Choose a valid form step.');
  const checked=validateReferenceAnswers(form,v.answers,{final:false});
  if(Object.keys(checked.errors).length)throw new FormValidationError(checked.errors);
  const {rows:[saved]}=await tx.query('UPDATE portal_form_records SET answers=$2,current_step=$3,lock_version=lock_version+1,updated_at=now() WHERE id=$1 RETURNING *',[recordId,JSON.stringify(checked.answers),v.currentStep]);
  return safeRecord(saved);
 });
}
export async function submitFormRecord(db:Db,actor:Actor|null,recordId:string,input:unknown,token?:string,now=new Date()) {
 const v=z.object({lockVersion:z.number().int().min(0),answers:z.record(z.string(),z.unknown())}).strict().parse(input);
 return db.transaction(async tx=>{
  const record=await owned(tx,actor,recordId,token,true);
  if(record.status==='submitted')return record.receipt;
  if(record.lock_version!==v.lockVersion)throw new AppError(409,'Reload the latest saved form before submitting.');
  const form=referenceForms.find(f=>f.key===record.form_key)!;
  const checked=validateReferenceAnswers(form,v.answers,{final:true,now});
  if(Object.keys(checked.errors).length)throw new FormValidationError(checked.errors);
  const answers=checked.answers;
  let schoolId:string|null=null,identityKey:string|null=null;
  if(form.competition){
   const {rows:[school]}=await tx.query("SELECT * FROM schools WHERE status='active' AND trashed_at IS NULL AND NOT purging AND id IN(SELECT school_id FROM school_identifiers WHERE reference=upper(trim($1))) FOR SHARE",[answers['text-yes-school-id']]);
   if(!school)throw new FormValidationError({'text-yes-school-id':'Select a registered school and its branch.'});
   schoolId=school.id;answers['text-yes-school']=`${school.name}, ${school.address}, ${school.city}`;
   answers['text-yes-school-id']=school.reference;
  }
  if(['student','teacher'].includes(form.key)){
   if(!actor||actor.contact?.toLowerCase()!==String(answers['email-1']).toLowerCase())throw new FormValidationError({'email-1':'Use the verified email address for the account you signed in with.'});
   const {rows:[school]}=await tx.query("SELECT * FROM schools WHERE status='active' AND trashed_at IS NULL AND NOT purging AND id IN(SELECT school_id FROM school_identifiers WHERE reference=upper(trim($1))) FOR SHARE",[answers['registered-school-id']||'']);
   if(!school)throw new FormValidationError({'registered-school-id':'Select a registered school and confirm its branch.'});
   schoolId=school.id;answers[form.key==='student'?'select-2':'select-3']=school.name;
  }
  if(form.key==='school'){
   const name=String(answers['text-1']||answers['select-1']||''),address=answers['address-1'] as Record<string,string>;
   // Shared coordinator contacts are deliberately not part of branch identity.
   const normalize=(value:string)=>value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
   identityKey=fingerprint([name,address.street_address,address.address_city,address.address_state].map(normalize));
   const {rows}=await tx.query("SELECT id FROM portal_form_records WHERE form_key='school' AND status='submitted' AND identity_key=$1",[identityKey]);
   if(rows.length)throw new AppError(409,'This school branch is already registered. Find its permanent school ID or contact support.');
   const existing=await tx.query("SELECT id FROM schools WHERE lower(trim(name))=$1 AND lower(trim(address))=$2 AND lower(trim(city))=$3 AND lower(trim(state))=$4 AND trashed_at IS NULL",[normalize(name),normalize(address.street_address),normalize(address.address_city),normalize(address.address_state)]);
   if(existing.rows.length)throw new AppError(409,'A matching school branch already exists. Use the school directory.');
   schoolId=id();
   await tx.query("INSERT INTO schools(id,reference,name,address,city,state,postal_code,status) VALUES($1,$2,$3,$4,$5,$6,$7,'pending')",[schoolId,`YES-SCH-${recordId.slice(0,12).toUpperCase()}`,name,address.street_address,address.address_city,address.address_state,address.address_zip||'']);
   await tx.query('INSERT INTO school_contacts(id,school_id,name,role,email,phone) VALUES($1,$2,$3,$4,$5,$6)',[id(),schoolId,String(answers['name-2']||''),'School representative',answers['email-1'],answers['phone-1']]);
  }
  const {rows:files}=await tx.query('SELECT * FROM portal_form_files WHERE record_id=$1 FOR SHARE',[recordId]);
  for(const field of form.fields.filter(f=>f.type==='upload')){
   const file=files.find(file=>file.field_id===field.id);
   if((field.required==='true'||field.required==='1')&&!file)throw new FormValidationError({[field.id]:'Attach the required file.'});
   if(file&&file.status!=='ready')throw new FormValidationError({[field.id]:'Wait for file verification to finish before submitting.'});
   if(file)answers[field.id]={id:file.id,filename:file.filename,checksum:file.expected_checksum,bytes:Number(file.expected_size)};
  }
  const receipt={id:record.id,reference:record.reference,formKey:form.key,submittedAt:now.toISOString(),status:'submitted',...(schoolId?{schoolId}:{}),...(form.key==='school'?{schoolStatus:'pending'}:{})};
  await tx.query("UPDATE portal_form_records SET status='submitted',answers=$2,school_id=$3,identity_key=$4,submitter_role=$5,form_snapshot=$6,receipt=$7,submitted_at=$8,updated_at=now(),lock_version=lock_version+1 WHERE id=$1",[recordId,JSON.stringify(answers),schoolId,identityKey,form.competition?answers['hidden-yes-submitter']:null,JSON.stringify(form),JSON.stringify(receipt),now]);
  if(actor)await audit(tx,actor,'reference-form.submit','portal_form_records',recordId,{formKey:form.key,reference:record.reference});
  return receipt;
 });
}
export async function writableFormRecord(db:Db,actor:Actor|null,recordId:string,token?:string) {
 const record=await owned(db,actor,recordId,token,true);
 if(record.status!=='draft')throw new AppError(409,'Submitted forms cannot be edited.');
 return record;
}
