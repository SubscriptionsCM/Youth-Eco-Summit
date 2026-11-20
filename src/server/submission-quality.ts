import {z} from 'zod';
import type {Db} from './db';
import {AppError,audit,id,type Actor} from './core';
import {loadSubmissionRecords,recordLink,requireActive,type SubmissionRecord} from './submission-records';
import {referenceForms,formTitle} from '../domain/wordpress-forms';
import {fingerprint} from './wordpress-migration';
import {submissionDateOrder,validSourceDate} from '../domain/source-dates';

const staff=['owner','admin'] as const;
const reason=z.string().trim().min(3).max(1000);
const source=z.enum(['portal','wordpress']);
const state=z.enum(['pending','in_progress','completed','needs_attention']);
const checksum=(r:SubmissionRecord,files:Map<string,unknown[]>)=>fingerprint({sourceChecksum:r.sourceChecksum,id:r.id,formKey:r.formKey,answers:r.answers,submittedAt:r.submittedAt,files:files.get(key(r))||[]});
const key=(r:{source:string;id?:string;record_id?:string})=>r.source+':'+(r.id||r.record_id);
function indiaDate(v:Date|string){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));}
async function fileVersions(db:Db,only?:{source:'portal'|'wordpress';recordId:string}){
 const files=new Map<string,unknown[]>();
 for(const source of ['portal','wordpress'] as const){
  if(only&&only.source!==source)continue;
  const sql=source==='portal'?"SELECT id,record_id,field_id,filename,storage_key,metadata,expected_size::text bytes,expected_checksum checksum,mime_type,status,(verified_at IS NOT NULL) verified FROM portal_form_files":"SELECT id,entry_record_id record_id,source_id,filename,storage_key,byte_size::text bytes,checksum,mime_type,(verified_at IS NOT NULL) verified FROM wordpress_attachments";
  const {rows}=await db.query(sql+(only?` WHERE ${source==='portal'?'record_id':'entry_record_id'}=$1`:'')+' ORDER BY id'+(only?' FOR SHARE':''),only?[only.recordId]:[]);
  for(const row of rows){const k=source+':'+row.record_id,list=files.get(k)||[];list.push(row);files.set(k,list);}
 }
 return files;
}

export async function saveQuality(db:Db,actor:Actor,input:unknown,now=new Date()){
 const v=z.object({source,recordId:z.uuid(),status:state,note:z.string().trim().max(4000).default(''),reason,lockVersion:z.number().int().min(0),sourceVersion:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(input);
 return db.transaction(async tx=>{
  await requireActive(tx,actor,staff);
  await tx.query(`SELECT id FROM ${v.source==='portal'?'portal_form_records':'wordpress_records'} WHERE id=$1 FOR UPDATE`,[v.recordId]);
  const only={source:v.source,recordId:v.recordId},record=(await loadSubmissionRecords(tx,only))[0];
  if(!record||record.kind!=='competition'||record.status!=='submitted')throw new AppError(422,'Quality checks apply only to submitted competition entries.');
  const sourceVersion=checksum(record,await fileVersions(tx,only));
  if(sourceVersion!==v.sourceVersion)throw new AppError(409,'The submission or its files changed after you opened this check. Refresh and review the current version.');
  await tx.query('INSERT INTO submission_quality(source,record_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[v.source,v.recordId]);
  const {rows:[current]}=await tx.query('SELECT * FROM submission_quality WHERE source=$1 AND record_id=$2 FOR UPDATE',[v.source,v.recordId]);
  if(current.lock_version!==v.lockVersion)throw new AppError(409,'This quality check changed in another tab. Refresh before saving.');
  const completed=v.status==='completed'?(current.status==='completed'&&current.checked_checksum===sourceVersion?current.completed_at:now):null;
  const {rows:[saved]}=await tx.query('UPDATE submission_quality SET status=$3,note=$4,checked_checksum=$5,completed_at=$6,updated_by=$7,updated_at=$8,lock_version=lock_version+1 WHERE source=$1 AND record_id=$2 RETURNING *',[v.source,v.recordId,v.status,v.note,sourceVersion,completed,actor.id,now]);
  await tx.query('INSERT INTO submission_quality_history(id,source,record_id,snapshot,actor_id,reason,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[id(),v.source,v.recordId,JSON.stringify({before:current,after:saved,reference:record.reference}),actor.id,v.reason,now]);
  await audit(tx,actor,'submission.quality.update','submission_quality',v.recordId,{source:v.source,status:v.status,reason:v.reason});
  return {status:saved.status,lockVersion:saved.lock_version};
 });
}
export async function setCategoryCoordinator(db:Db,actor:Actor,input:unknown){
 const v=z.object({formKey:z.string(),coordinator:z.string().trim().max(200),reason,lockVersion:z.number().int().min(0)}).strict().parse(input);
 if(!referenceForms.some(f=>f.key===v.formKey&&f.competition))throw new AppError(422,'Choose a competition.');
 return db.transaction(async tx=>{
  await requireActive(tx,actor,staff);
  await tx.query("INSERT INTO submission_category_coordinators(form_key,coordinator,updated_by) VALUES($1,'',$2) ON CONFLICT DO NOTHING",[v.formKey,actor.id]);
  const {rows:[before]}=await tx.query('SELECT * FROM submission_category_coordinators WHERE form_key=$1 FOR UPDATE',[v.formKey]);
  if(before.lock_version!==v.lockVersion)throw new AppError(409,'The coordinator changed in another tab. Refresh before saving.');
  await tx.query('UPDATE submission_category_coordinators SET coordinator=$2,updated_by=$3,updated_at=now(),lock_version=lock_version+1 WHERE form_key=$1',[v.formKey,v.coordinator,actor.id]);
  await audit(tx,actor,'submission.coordinator.update','submission_category_coordinators',v.formKey,{before:before.coordinator,after:v.coordinator,reason:v.reason});return {saved:true};
 });
}
export async function submissionReport(db:Db,actor:Actor,params:URLSearchParams,now=new Date()){
 await requireActive(db,actor,staff);
 const reportDate=params.get('reportDate')||'';
 if(reportDate&&(!validSourceDate(reportDate+'T00:00:00')||reportDate.length!==10||reportDate>indiaDate(now)))throw new AppError(422,'Choose a valid report date up to today (India time).');
 const cutoff=reportDate?new Date(Math.min(now.getTime(),new Date(reportDate+'T23:59:59.999+05:30').getTime())):now;
 const year=params.get('year')||'',schoolId=params.get('schoolId')||'',formKey=params.get('formKey')||'',selectedSource=params.get('source')||'',q=(params.get('q')||'').trim().toLowerCase().slice(0,150),qcStatus=params.get('qcStatus')||'';
 if(year&&!/^\d{4}$/.test(year))throw new AppError(422,'Choose a valid submission year.');
 if(schoolId&&!z.uuid().safeParse(schoolId).success)throw new AppError(422,'Choose a valid school.');
 if(selectedSource&&!source.safeParse(selectedSource).success)throw new AppError(422,'Choose a valid entry source.');
 if(qcStatus&&!state.safeParse(qcStatus).success)throw new AppError(422,'Choose a valid quality-check status.');
 if(formKey&&!referenceForms.some(f=>f.key===formKey&&f.competition))throw new AppError(422,'Choose a valid competition.');
 const all=await loadSubmissionRecords(db);
 const versions=await fileVersions(db);
 const scopeBase=all.filter(r=>(!schoolId||r.schoolId===schoolId)&&(!selectedSource||r.source===selectedSource));
 const base=scopeBase.filter(r=>(!year||r.year===year)&&(!reportDate||!!r.submittedAt&&submissionDateOrder(r.submittedAt,r.source).slice(0,10)<=reportDate));
 const {rows:qualities}=await db.query<Record<string,any>&{source:string;record_id:string}>('SELECT * FROM submission_quality');
 const quality=new Map(qualities.map(q=>[key(q),q]));
 if(reportDate){
  // Later reopening must not rewrite an earlier day's recorded QC decision.
  const {rows:history}=await db.query<{source:string;record_id:string;snapshot:Record<string,any>}>("SELECT DISTINCT ON (source,record_id) source,record_id,snapshot FROM submission_quality_history WHERE created_at <= $1 ORDER BY source,record_id,created_at DESC,(snapshot->'after'->>'lock_version')::int DESC",[cutoff]);
  quality.clear();
  for(const row of history)quality.set(key(row),row.snapshot.after);
  for(const row of qualities)if(!quality.has(key(row))&&new Date(row.updated_at)<=cutoff)quality.set(key(row),row);
 }
 const {rows:coordinators}=await db.query('SELECT form_key,coordinator,lock_version,updated_at FROM submission_category_coordinators');
 if(reportDate){
  const {rows:events}=await db.query("SELECT entity_id,detail,created_at FROM audit_events WHERE action='submission.coordinator.update' AND entity_type='submission_category_coordinators' ORDER BY created_at,id");
  for(const c of coordinators){
   const changes=events.filter(e=>e.entity_id===c.form_key),past=changes.filter(e=>new Date(e.created_at)<=cutoff);
   if(past.length)c.coordinator=past[past.length-1].detail.after;
   else if(changes.length)c.coordinator=changes[0].detail.before;
   else if(new Date(c.updated_at)>cutoff)c.coordinator='';
  }
 }
 const {rows:schools}=await db.query("SELECT id,name,reference FROM schools WHERE trashed_at IS NULL AND NOT purging ORDER BY name,id");
 const schoolNames=new Map(schools.map(s=>[s.id,s.name]));
 const entries=base.filter(r=>r.kind==='competition'&&r.status==='submitted'&&(!formKey||r.formKey===formKey));
 const enriched=entries.map(r=>{
  const sourceVersion=checksum(r,versions),qc=quality.get(key(r)),changed=qc&&qc.checked_checksum!==sourceVersion,status=changed?'needs_attention':qc?.status||'pending';
  return {id:r.id,source:r.source,formKey:r.formKey,title:r.title,reference:r.reference,submittedAt:r.submittedAt,year:r.year,schoolId:r.schoolId,schoolName:schoolNames.get(r.schoolId)||'School not linked',name:r.name,className:r.className,href:recordLink(r),qcStatus:status,qcVersion:qc?.lock_version||0,qcNote:qc?.note||'',completedAt:!changed&&qc?.status==='completed'?qc.completed_at:null,sourceChanged:!!changed,sourceVersion};
 });
 const completed=enriched.filter(r=>r.qcStatus==='completed');
 const totalRegistrations=base.filter(r=>['student','teacher','school'].includes(r.kind)&&r.status==='submitted').length;
 const summary={totalRegistrations,registrations:base.filter(r=>r.kind==='student'&&r.status==='submitted').length,educators:base.filter(r=>r.kind==='teacher'&&r.status==='submitted').length,schoolRegistrations:base.filter(r=>r.kind==='school'&&r.status==='submitted').length,submissions:entries.length,qcCompleted:completed.length,qcRemaining:entries.length-completed.length,qcCompletedToday:completed.filter(r=>r.completedAt&&indiaDate(r.completedAt)===(reportDate||indiaDate(now))).length,drafts:base.filter(r=>r.kind==='competition'&&r.status==='draft'&&(!formKey||r.formKey===formKey)).length,unknownDates:scopeBase.filter(r=>r.status==='submitted'&&!r.year).length,unlinkedSchool:entries.filter(r=>!r.schoolId).length};
 const categories=referenceForms.filter(f=>f.competition&&(!formKey||f.key===formKey)).map(f=>{
  const rows=enriched.filter(r=>r.formKey===f.key),done=rows.filter(r=>r.qcStatus==='completed');
  return {formKey:f.key,title:formTitle(f),coordinator:coordinators.find(c=>c.form_key===f.key)?.coordinator||'',coordinatorVersion:coordinators.find(c=>c.form_key===f.key)?.lock_version||0,submissions:rows.length,completed:done.length,remaining:rows.length-done.length,today:done.filter(r=>r.completedAt&&indiaDate(r.completedAt)===(reportDate||indiaDate(now))).length,inProgress:rows.filter(r=>r.qcStatus==='in_progress').length,needsAttention:rows.filter(r=>r.qcStatus==='needs_attention').length};
 });
 const {rows:assignments}=await db.query("SELECT a.judge_id,u.name,u.contact,u.active judge_active,u.role judge_role,r.form_key,r.edition,r.name round_name,a.active,a.portal_record_id,a.wordpress_record_id,coalesce(v.status,'pending') status FROM judging_assignments a JOIN users u ON u.id=a.judge_id JOIN judging_rounds r ON r.id=a.round_id LEFT JOIN judging_reviews v ON v.assignment_id=a.id");
 const ids=new Set(entries.map(r=>key(r)));
 const judgeGroups=new Map<string,any>();
 for(const a of assignments){if(!a.active||!ids.has((a.portal_record_id?'portal:':'wordpress:')+(a.portal_record_id||a.wordpress_record_id)))continue;const k=a.judge_id+':'+a.form_key;let g=judgeGroups.get(k);if(!g){g={judgeId:a.judge_id,name:a.name||a.contact,competition:referenceForms.find(f=>f.key===a.form_key)?.title||a.form_key,assigned:0,completed:0,inProgress:0,reviewerAvailable:a.judge_active&&['judge','admin','owner'].includes(a.judge_role)};judgeGroups.set(k,g);}g.assigned++;if(a.status==='submitted')g.completed++;if(a.status==='draft')g.inProgress++;}
 const filtered=enriched.filter(r=>(!qcStatus||r.qcStatus===qcStatus)&&(!q||`${r.reference} ${r.title} ${r.name} ${r.schoolName}`.toLowerCase().includes(q))).sort((a,b)=>(b.submittedAt||'').localeCompare(a.submittedAt||'')||a.id.localeCompare(b.id));
 const page=Math.max(1,Math.min(100000,Math.floor(Number(params.get('page'))||1))),pageSize=25;
 return {summary,categories,judges:[...judgeGroups.values()].map(j=>({...j,remaining:j.assigned-j.completed})),items:filtered.slice((page-1)*pageSize,page*pageSize),total:filtered.length,page,pageSize,catalogue:referenceForms.filter(f=>f.competition).map(f=>({formKey:f.key,title:formTitle(f)})),years:[...new Set(all.map(r=>r.year).filter(Boolean))].sort().reverse(),schools,scope:{reportDate:reportDate||null,year:year||'all',source:selectedSource||'all',schoolId,formKey,registrationDefinition:'All submitted student, educator and school registration forms; records, not unique people. Forms without a verified registration type stay in Forms & submissions and are excluded from registration totals. Competition filters apply to competition and QC totals only.',todayTimezone:'Asia/Kolkata',qcDefinition:'QC is separate from judging. Missing QC records are pending; remaining includes pending, in progress and needs attention.',sourceDefinition:'Counts use each original record identity. Records and people are not automatically merged.'},checkedAt:now.toISOString()};
}
