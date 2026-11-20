import type {Db} from './db';
import type {Actor} from './core';
import {loadSubmissionRecords,recordLink,requireActive} from './submission-records';
import {plainText,referenceForms,isFieldVisible} from '../domain/wordpress-forms';
import {displayReferenceValue} from '../domain/reference-values';
import {submissionDateOrder} from '../domain/source-dates';

/** Unified staff read model. No source records are merged, edited or reassigned. */
export async function submissionInbox(db:Db,actor:Actor,params:URLSearchParams){
 await requireActive(db,actor,['owner','admin']);
 const records=(await loadSubmissionRecords(db,{includeUnknown:true})).filter(r=>r.source!=='portal'||r.status==='submitted');
 const {rows:schools}=await db.query('SELECT id,name FROM schools WHERE trashed_at IS NULL AND NOT purging');
 const names=new Map(schools.map(s=>[s.id,s.name]));
 const [native,imported]=await Promise.all([
  db.query("SELECT record_id,count(*)::int total FROM portal_form_files WHERE status='ready' GROUP BY record_id"),
  db.query('SELECT a.entry_record_id record_id,count(*)::int total FROM wordpress_attachments a JOIN wordpress_records r ON r.id=a.entry_record_id AND r.source=a.source WHERE a.verified_at IS NOT NULL GROUP BY a.entry_record_id')
 ]);
 const files=new Map([...native.rows.map(r=>['portal:'+r.record_id,r.total] as const),...imported.rows.map(r=>['wordpress:'+r.record_id,r.total] as const)]);
 const q=(params.get('q')||'').trim().toLowerCase().slice(0,200),school=params.get('schoolId'),recordId=params.get('id'),type=params.get('formKey');
 const items=records.map(r=>{
  const key=r.source+':'+r.id,formKey=['student','teacher','school'].includes(r.kind)?r.kind:r.formKey;
  const schoolFields=referenceForms.find(f=>f.key===r.formKey)?.fields.filter(field=>
   ['text','select','name'].includes(field.type)&&/^(?:school(?:\s*\/\s*branch)?\s+name|name of (?:the )?school)\b/i.test(plainText(field.field_label))&&isFieldVisible(field,r.answers))||[];
  const recordedSchool=schoolFields.map(field=>plainText(displayReferenceValue(field.type,r.answers[field.id]))).find(value=>value&&!/^(?:other\b|not listed\b)/i.test(value));
  const schoolName=names.get(r.schoolId)||r.recordedSchoolName||recordedSchool||'';
  return {key,id:r.id,form_key:formKey,title:r.title,reference:r.reference,status:r.status,name:r.name,school_id:r.schoolId,school_name:schoolName,submitted_at:r.submittedAt,dateSource:r.source,file_count:Number(files.get(key)||0),href:recordLink(r)};
 }).filter(r=>(!school||r.school_id===school)&&(!recordId||r.id===recordId)&&(!q||`${r.reference} ${r.name} ${r.school_name} ${r.title}`.toLowerCase().includes(q)));
 const formTotals:Record<string,number>={};for(const r of items)formTotals[r.form_key]=(formTotals[r.form_key]||0)+1;
 const dates=new Map(items.map(r=>[r.key,submissionDateOrder(r.submitted_at,r.dateSource)]));
 const matching=items.filter(r=>!type||r.form_key===type).sort((a,b)=>dates.get(b.key)!.localeCompare(dates.get(a.key)!)||a.key.localeCompare(b.key));
 const page=Math.max(1,Math.min(100000,Math.floor(Number(params.get('page'))||1))),pageSize=Math.max(1,Math.min(100,Math.floor(Number(params.get('pageSize'))||25)));
 const formOptions=[...new Map(items.map(r=>[r.form_key,{key:r.form_key,title:r.title}])).values()].sort((a,b)=>a.title.localeCompare(b.title));
 return {items:matching.slice((page-1)*pageSize,page*pageSize),total:matching.length,page,pageSize,formTotals,formOptions};
}
