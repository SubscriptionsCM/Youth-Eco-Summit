import {z} from 'zod';
import type {Db} from './db';
import {AppError,audit,id,requireAdmin,type Actor} from './core';
import {judgingCatalogue,judgingReviewSchema,judgingRubricSchema,judgingTotal} from '../domain/judge-portal';
import {referenceForms} from '../domain/wordpress-forms';
import {fingerprint} from './wordpress-migration';
import {judgingSource,type JudgingSnapshot,type JudgingSource} from './judge-portal-source';
import type {RetainedDownload} from './storage/downloads';

async function active(db:Db,actor:Actor,staff=false){
 if(staff)requireAdmin(actor);else if(!['judge','admin','owner'].includes(actor.role))throw new AppError(403,'Judge access required.');
 const {rows}=await db.query('SELECT id FROM users WHERE id=$1 AND role=$2 AND active=true FOR SHARE',[actor.id,actor.role]);
 if(!rows.length)throw new AppError(401,'Your account is unavailable or permissions changed.');
}
const reason=z.string().trim().min(3).max(1000);
export async function createJudgingRound(db:Db,actor:Actor,input:unknown){
 const v=z.object({formKey:z.string(),edition:z.string().trim().min(1).max(80),name:z.string().trim().min(2).max(200),open:z.boolean().default(false)}).strict().parse(input);
 return db.transaction(async tx=>{await active(tx,actor,true);const competition=judgingCatalogue.find(c=>c.key===v.formKey);if(!competition)throw new AppError(422,'Choose a supported competition.');
  if(v.edition!=='2027')throw new AppError(422,'These source rubrics are approved for edition 2027. Other editions need their own approved rubric.');
  const {rows:[round]}=await tx.query('INSERT INTO judging_rounds(id,form_key,edition,name,rubric,open,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[id(),v.formKey,v.edition,v.name,JSON.stringify(competition.rubric),v.open,actor.id]);
  await audit(tx,actor,'judging.round.create','judging_rounds',round.id,{formKey:v.formKey,edition:v.edition,open:v.open});return round;
 });
}
export async function changeJudgingRound(db:Db,actor:Actor,roundId:string,input:unknown){
 z.uuid().parse(roundId);const v=z.object({open:z.boolean()}).strict().parse(input);
 return db.transaction(async tx=>{await active(tx,actor,true);const {rows:[round]}=await tx.query('UPDATE judging_rounds SET open=$2,updated_at=now() WHERE id=$1 RETURNING *',[roundId,v.open]);if(!round)throw new AppError(404,'Judging round not found.');await audit(tx,actor,'judging.round.state','judging_rounds',roundId,v);return round;});
}
export async function assignJudgingEntries(db:Db,actor:Actor,input:unknown){
 const v=z.object({roundId:z.uuid(),judgeId:z.uuid(),source:z.enum(['portal','wordpress']),entryIds:z.array(z.uuid()).min(1).max(100),reason}).strict().parse(input);
 return db.transaction(async tx=>{await active(tx,actor,true);
  const {rows:[round]}=await tx.query('SELECT * FROM judging_rounds WHERE id=$1 FOR UPDATE',[v.roundId]);if(!round)throw new AppError(422,'Choose a judging round.');
  const {rows:[judge]}=await tx.query("SELECT id FROM users WHERE id=$1 AND role IN ('judge','owner','admin') AND active=true FOR SHARE",[v.judgeId]);if(!judge)throw new AppError(422,'Choose an active reviewer.');
  const items=[];for(const entryId of [...new Set(v.entryIds)].sort()){
   const source=await judgingSource(tx,v.source,entryId);if(source.snapshot.formKey!==round.form_key)throw new AppError(422,'Entry competition does not match the round.');
   const column=v.source==='portal'?'portal_record_id':'wordpress_record_id';
   const {rows:[old]}=await tx.query(`SELECT id,active,source_checksum FROM judging_assignments WHERE round_id=$1 AND judge_id=$2 AND ${column}=$3 FOR UPDATE`,[round.id,v.judgeId,entryId]);
   if(old){if(!old.active||old.source_checksum!==source.checksum)throw new AppError(409,'This assignment was revoked or its source changed. Create an explicit new review round.');items.push({id:old.id});continue;}
   const assignmentId=id();await tx.query(`INSERT INTO judging_assignments(id,round_id,judge_id,${column},snapshot,snapshot_checksum,source_checksum,assigned_by,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[assignmentId,round.id,v.judgeId,entryId,JSON.stringify(source.snapshot),fingerprint(source.snapshot),source.checksum,actor.id,v.reason]);
   await audit(tx,actor,'judging.assign','judging_assignments',assignmentId,{source:v.source,entryId,roundId:round.id,judgeId:v.judgeId,reason:v.reason});items.push({id:assignmentId});
  }return {items};
 });
}
async function lockAssignmentRound(db:Db,assignmentId:string){
 const {rows:[link]}=await db.query('SELECT round_id FROM judging_assignments WHERE id=$1',[assignmentId]);
 if(!link)throw new AppError(404,'This judging assignment is unavailable.');
 await db.query('SELECT id FROM judging_rounds WHERE id=$1 FOR SHARE',[link.round_id]);
}
async function assignment(db:Db,actor:Actor,assignmentId:string,staff=false){
 z.uuid().parse(assignmentId);await active(db,actor,staff);
 await lockAssignmentRound(db,assignmentId);
 const {rows:[a]}=await db.query('SELECT a.*,r.form_key,r.edition,r.name round_name,r.open,r.rubric FROM judging_assignments a JOIN judging_rounds r ON r.id=a.round_id WHERE a.id=$1 FOR SHARE OF a',[assignmentId]);
 if(!a||(!staff&&(!a.active||a.judge_id!==actor.id)))throw new AppError(404,'This judging assignment is unavailable.');
 if(fingerprint(a.snapshot)!==a.snapshot_checksum)throw new AppError(409,'The assigned snapshot failed verification. Contact staff.');
 const source=await judgingSource(db,a.portal_record_id?'portal':'wordpress',a.portal_record_id??a.wordpress_record_id);
 if(source.checksum!==a.source_checksum||fingerprint(source.snapshot)!==a.snapshot_checksum)throw new AppError(409,'The submitted work changed after assignment. Contact staff.');
 return a;
}
export async function judgingDetail(db:Db,actor:Actor,assignmentId:string){
 return db.transaction(async tx=>{const a=await assignment(tx,actor,assignmentId);const {rows:[review]}=await tx.query('SELECT * FROM judging_reviews WHERE assignment_id=$1',[a.id]);
  return {assignment:{id:a.id,active:a.active},entry:a.snapshot as JudgingSnapshot,round:{name:a.round_name,edition:a.edition,open:a.open,rubric:a.rubric},review:review?reviewDto(review):null};
 });
}
function reviewDto(r:any){return {scores:r.scores,deductions:r.deductions,comment:r.comment,flag:r.flag,total:Number(r.total),status:r.status,lock_version:r.lock_version,submitted_at:r.submitted_at};}
export async function saveJudgingReview(db:Db,actor:Actor,assignmentId:string,input:unknown,final:boolean){
 const v=judgingReviewSchema.parse(input);z.uuid().parse(assignmentId);
 return db.transaction(async tx=>{
  // Serialize first creation as well as subsequent saves, revokes and reopen actions.
  await active(tx,actor);await lockAssignmentRound(tx,assignmentId);
  await tx.query('SELECT id FROM judging_assignments WHERE id=$1 FOR UPDATE',[assignmentId]);const a=await assignment(tx,actor,assignmentId);
  if(!a.open)throw new AppError(409,'This judging round is closed.');
  const {rows:[old]}=await tx.query('SELECT * FROM judging_reviews WHERE assignment_id=$1 FOR UPDATE',[a.id]);
  if(old?.status==='submitted')throw new AppError(409,'This final review is locked. Ask staff to reopen it with a reason.');
  if((old?.lock_version??0)!==v.lockVersion)throw new AppError(409,'This review changed in another tab. Reload before saving.');
  const total=judgingTotal(judgingRubricSchema.parse(a.rubric),v,final);
  const {rows:[review]}=await tx.query(`INSERT INTO judging_reviews(id,assignment_id,scores,deductions,comment,flag,total,status,submitted_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $8='submitted' THEN now() ELSE NULL END)
   ON CONFLICT(assignment_id) DO UPDATE SET scores=excluded.scores,deductions=excluded.deductions,comment=excluded.comment,flag=excluded.flag,total=excluded.total,status=excluded.status,submitted_at=excluded.submitted_at,lock_version=judging_reviews.lock_version+1,updated_at=now() RETURNING *`,[old?.id??id(),a.id,JSON.stringify(v.scores),JSON.stringify(v.deductions),v.comment.trim(),v.flag,total,final?'submitted':'draft']);
  await audit(tx,actor,final?'judging.review.submit':'judging.review.save','judging_reviews',review.id,{assignmentId:a.id,total,status:review.status});return reviewDto(review);
 });
}
export async function changeJudgingAssignment(db:Db,actor:Actor,assignmentId:string,input:unknown){
 z.uuid().parse(assignmentId);const v=z.object({action:z.enum(['revoke','reopen']),reason}).strict().parse(input);
 return db.transaction(async tx=>{await active(tx,actor,true);const {rows:[a]}=await tx.query('SELECT * FROM judging_assignments WHERE id=$1 FOR UPDATE',[assignmentId]);if(!a)throw new AppError(404,'Assignment not found.');
  if(v.action==='revoke'){if(!a.active)throw new AppError(409,'Assignment already revoked.');await tx.query('UPDATE judging_assignments SET active=false,revoked_at=now(),revoked_reason=$2 WHERE id=$1',[a.id,v.reason]);}
  else{if(!a.active)throw new AppError(409,'A revoked assignment cannot be reopened.');const {rows:[review]}=await tx.query('SELECT * FROM judging_reviews WHERE assignment_id=$1 FOR UPDATE',[a.id]);if(!review||review.status!=='submitted')throw new AppError(409,'Choose a submitted review to reopen.');
   await tx.query('INSERT INTO judging_review_history(id,review_id,snapshot,changed_by,reason) VALUES($1,$2,$3,$4,$5)',[id(),review.id,JSON.stringify(review),actor.id,v.reason]);await tx.query("UPDATE judging_reviews SET status='draft',submitted_at=NULL,lock_version=lock_version+1,updated_at=now() WHERE id=$1",[review.id]);}
  await audit(tx,actor,`judging.assignment.${v.action}`,'judging_assignments',a.id,{reason:v.reason});return {ok:true};
 });
}
export async function judgingQueue(db:Db,actor:Actor,params:URLSearchParams){
 await active(db,actor);const page=Math.max(1,Math.min(100000,Math.floor(Number(params.get('page'))||1))),q=(params.get('q')||'').slice(0,150),status=params.get('status')||'';
 const from="FROM judging_assignments a JOIN judging_rounds r ON r.id=a.round_id LEFT JOIN judging_reviews v ON v.assignment_id=a.id WHERE a.judge_id=$1 AND a.active AND ($2='' OR a.snapshot->>'reference' ILIKE '%'||$2||'%' OR a.snapshot->>'title' ILIKE '%'||$2||'%') AND ($3='' OR coalesce(v.status,'pending')=$3)";
 const values=[actor.id,q,status];const {rows:[count]}=await db.query('SELECT count(*)::int total '+from,values);
 const {rows:items}=await db.query("SELECT a.id,a.snapshot->>'reference' reference,a.snapshot->>'title' title,r.name round_name,r.edition,r.open,coalesce(v.status,'pending') status,v.total "+from+' ORDER BY a.created_at DESC,a.id LIMIT 25 OFFSET $4',[...values,(page-1)*25]);
 return {items,total:count.total,page,pageSize:25};
}
export async function judgingAdministration(db:Db,actor:Actor,params=new URLSearchParams()){
 await active(db,actor,true);const page=Math.max(1,Math.min(100000,Math.floor(Number(params.get('page'))||1)));
 const {rows:rounds}=await db.query('SELECT * FROM judging_rounds ORDER BY created_at DESC,id LIMIT 200');
 const {rows:judges}=await db.query("SELECT u.id,u.name,u.contact,u.role,u.active,(SELECT count(*)::int FROM judging_assignments a WHERE a.judge_id=u.id AND a.active) assigned_count,(SELECT count(*)::int FROM judging_assignments a JOIN judging_reviews v ON v.assignment_id=a.id WHERE a.judge_id=u.id AND a.active AND v.status='submitted') completed_count,coalesce((SELECT jsonb_agg(DISTINCT r.form_key) FROM judging_assignments a JOIN judging_rounds r ON r.id=a.round_id WHERE a.judge_id=u.id AND a.active),'[]'::jsonb) competition_keys FROM users u WHERE u.role IN ('judge','admin','owner') ORDER BY u.name,u.contact");
 const {rows:[count]}=await db.query('SELECT count(*)::int total,count(*) FILTER(WHERE active)::int active_total FROM judging_assignments');
 const {rows:assignments}=await db.query("SELECT a.id,a.round_id,a.active,a.reason,a.revoked_reason,a.judge_id,a.snapshot->>'reference' reference,a.snapshot->>'title' title,r.name round_name,r.edition,coalesce(v.status,'pending') status,v.scores,v.deductions,v.total,v.comment,v.flag,v.submitted_at FROM judging_assignments a JOIN judging_rounds r ON r.id=a.round_id LEFT JOIN judging_reviews v ON v.assignment_id=a.id ORDER BY a.created_at DESC,a.id LIMIT 50 OFFSET $1",[(page-1)*50]);
 return {rounds,judges,assignments,catalogue:judgingCatalogue,total:count.total,activeTotal:count.active_total,page,pageSize:50};
}
export async function listJudgingEntries(db:Db,actor:Actor,params:URLSearchParams){
 await active(db,actor,true);const source=z.enum(['portal','wordpress']).parse(params.get('source')||'portal'),form=referenceForms.find(f=>f.key===params.get('formKey')&&f.competition);if(!form)throw new AppError(422,'Choose a competition first.');
 const page=Math.max(1,Math.min(100000,Math.floor(Number(params.get('page'))||1))),q=(params.get('q')||'').slice(0,100);
 const where=source==='portal'?"FROM portal_form_records WHERE status='submitted' AND form_key=$1 AND reference ILIKE '%'||$2||'%'":"FROM wordpress_records WHERE kind='entry' AND payload->>'form_id'=$1 AND payload->>'status' IN ('active','submitted','completed') AND lower(trim(coalesce(payload->>'is_draft','0'))) IN ('0','false','') AND source_id ILIKE '%'||$2||'%'";
 const values=[source==='portal'?form.key:String(form.id),q];const {rows:[count]}=await db.query('SELECT count(*)::int total '+where,values);
 const select=source==='portal'?'id,reference,submitted_at':"id,'WP-'||source_id reference,CASE WHEN jsonb_typeof(payload->'date_created')='string' THEN NULLIF(btrim(payload->>'date_created'),'') ELSE NULL END submitted_at,captured_at imported_at";
 const {rows:items}=await db.query('SELECT '+select+' '+where+' ORDER BY submitted_at DESC NULLS LAST,id LIMIT 25 OFFSET $3',[...values,(page-1)*25]);return {items,total:count.total,page,pageSize:25};
}
export async function judgingFile(db:Db,actor:Actor,assignmentId:string,fileId:string):Promise<RetainedDownload>{
 z.uuid().parse(fileId);return db.transaction(async tx=>{const a=await assignment(tx,actor,assignmentId),snapshot=a.snapshot as JudgingSnapshot;
  const expected=snapshot.files.find(f=>f.id===fileId);if(!expected)throw new AppError(404,'Assigned file not found.');
  let file;if(a.portal_record_id){const {rows:[row]}=await tx.query("SELECT storage_key,expected_size bytes,expected_checksum checksum,mime_type mime,metadata FROM portal_form_files WHERE id=$1 AND record_id=$2 AND status='ready'",[fileId,a.portal_record_id]);file=row;}
  else{const {rows:[row]}=await tx.query('SELECT storage_key,byte_size bytes,checksum,mime_type mime FROM wordpress_attachments WHERE id=$1 AND entry_record_id=$2 AND verified_at IS NOT NULL',[fileId,a.wordpress_record_id]);file=row;}
  if(!file||Number(file.bytes)!==expected.bytes||file.checksum!==expected.checksum||file.mime!==expected.mime)throw new AppError(409,'Assigned file integrity no longer matches. Contact staff.');
  const ext=({'application/pdf':'.pdf','image/jpeg':'.jpg','image/png':'.png','video/mp4':'.mp4'} as Record<string,string>)[file.mime]||'';
  return {key:file.storage_key,filename:expected.label+ext,mime:file.mime,size:Number(file.bytes),checksum:file.checksum,version:file.metadata?.storageVersion,etag:file.metadata?.storageEtag};
 });
}
