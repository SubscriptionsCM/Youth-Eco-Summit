import {z} from 'zod';
import type {Db} from './db';
import {AppError} from './core';
import {referenceForms,plainText,formTitle,type ReferenceForm} from '../domain/wordpress-forms';
import {judgingFieldIds} from '../domain/judge-portal';
import {fingerprint} from './wordpress-migration';

export type JudgingSource='portal'|'wordpress';
export type JudgingSnapshot={reference:string;formKey:string;title:string;fields:{id:string;label:string;value:string}[];files:{id:string;mime:string;bytes:number;checksum:string;label:string}[]};
export async function judgingSource(db:Db,source:JudgingSource,id:string){
 z.uuid().parse(id);let form:ReferenceForm|undefined,answers:Record<string,unknown>,reference,checksum,files:any[],raw:any;
 if(source==='portal'){
  const {rows:[record]}=await db.query("SELECT * FROM portal_form_records WHERE id=$1 FOR SHARE",[id]);
  if(!record||record.status!=='submitted')throw new AppError(422,'Choose a submitted competition entry.');
  form=referenceForms.find(f=>f.key===record.form_key&&f.competition);answers=record.answers;reference=record.reference;
  checksum=fingerprint({formKey:record.form_key,answers:record.answers,form:record.form_snapshot,receipt:record.receipt});
  const result=await db.query("SELECT id,field_id,mime_type,expected_size,expected_checksum,status FROM portal_form_files WHERE record_id=$1 ORDER BY field_id,id FOR SHARE",[id]);files=result.rows;
  if(files.some(f=>f.status!=='ready'))throw new AppError(409,'Every attached file must finish verification before assignment.');
 }else{
  const {rows:[record]}=await db.query("SELECT * FROM wordpress_records WHERE id=$1 AND kind='entry' FOR SHARE",[id]);
  const draft=record?.payload.is_draft;
  const nonDraft=draft===undefined||draft===null||draft===false||draft===0||(typeof draft==='string'&&['','0','false'].includes(draft.trim().toLowerCase()));
  if(!record||!['active','submitted','completed'].includes(record.payload.status)||!nonDraft)throw new AppError(422,'Choose a completed archived competition entry.');
  if(fingerprint(record.payload)!==record.checksum)throw new AppError(409,'The archived entry checksum does not verify.');
  form=referenceForms.find(f=>String(f.id)===String(record.payload.form_id)&&f.competition);raw=record.payload;
  answers=Object.fromEntries((Array.isArray(raw.meta)?raw.meta:[]).filter((m:any)=>m&&typeof m.meta_key==='string').map((m:any)=>[m.meta_key,m.meta_value]));
  reference=`WP-${record.source_id}`;checksum=record.checksum;
  const result=await db.query('SELECT id,source_id,mime_type,byte_size,checksum,verified_at FROM wordpress_attachments WHERE entry_record_id=$1 AND source=$2 ORDER BY source_id,id FOR SHARE',[id,record.source]);
  files=result.rows.map(file=>{const metaId=String(file.source_id).split(':')[0],matches=(Array.isArray(raw.meta)?raw.meta:[]).filter((m:any)=>String(m.meta_id)===metaId&&form?.fields.some(f=>f.id===m.meta_key&&f.type==='upload'));return {...file,field_id:matches.length===1?matches[0].meta_key:null};});
  if(files.some(f=>!f.field_id))throw new AppError(409,'An archived attachment cannot be reconciled to its original upload field.');
  if(files.some(f=>!f.verified_at))throw new AppError(409,'Every archived attachment must be verified.');
 }
 if(!form)throw new AppError(422,'This source form has no supported competition mapping.');
 const required=form.fields.filter(f=>f.type==='upload'&&(f.required==='true'||f.required==='1'));
 if(!files.length||required.some(f=>!files.some(file=>file.field_id===f.id)))throw new AppError(422,'The submitted competition entry is missing required files.');
 const snapshot:JudgingSnapshot={reference,formKey:form.key,title:formTitle(form),fields:form.fields.filter(f=>judgingFieldIds.has(f.id)&&answers[f.id]!==undefined&&['string','number'].includes(typeof answers[f.id])).map(f=>({id:f.id,label:plainText(f.field_label||f.id),value:plainText(answers[f.id]).slice(0,1000)})),files:files.map((f,i)=>({id:f.id,mime:f.mime_type||'application/octet-stream',bytes:Number(f.expected_size??f.byte_size),checksum:f.expected_checksum??f.checksum,label:`Submitted file ${i+1}`}))};
 return {snapshot,checksum};
}
