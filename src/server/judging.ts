import { z } from 'zod';
import type { Db } from './db';
import { AppError,type Actor,id,audit,requireAdmin } from './core';
import { rubricSchema,validateScores,nextState } from '../domain/rules';
import { entryAccess } from './access';
export async function routeEntries(db:Db){
 // Revoked rows are durable exclusions: ON CONFLICT never silently restores them.
 const {rows}=await db.query(`INSERT INTO judge_assignments(id,submission_id,judge_id,round_id,rule_id,revision)
  SELECT gen_random_uuid(),s.id,r.judge_id,r.round_id,r.id,s.revision FROM assignment_rules r
  JOIN users u ON u.id=r.judge_id JOIN review_rounds rr ON rr.id=r.round_id JOIN submissions s ON s.competition_id=r.competition_id AND s.category_id=r.category_id
  JOIN competitions c ON c.id=s.competition_id JOIN editions e ON e.id=c.edition_id JOIN student_participations p ON p.id=s.student_participation_id JOIN students st ON st.id=p.student_id JOIN schools sc ON sc.id=p.school_id
  WHERE r.active AND rr.open AND u.active AND s.state<>'draft' AND s.revision>0 AND rr.eligible_states ? s.state AND e.state<>'archived'
  AND s.trashed_at IS NULL AND NOT s.purging AND p.trashed_at IS NULL AND st.trashed_at IS NULL AND sc.trashed_at IS NULL
  AND EXISTS(SELECT 1 FROM submission_revisions v WHERE v.submission_id=s.id AND v.version=s.revision)
  AND NOT EXISTS(SELECT 1 FROM submission_revisions v CROSS JOIN LATERAL jsonb_array_elements_text(v.asset_ids) selected(id) LEFT JOIN assets a ON a.id::text=selected.id AND a.submission_id=s.id AND a.revision=s.revision WHERE v.submission_id=s.id AND v.version=s.revision AND (a.id IS NULL OR a.status<>'ready' OR a.trashed_at IS NOT NULL))
  ON CONFLICT(submission_id,judge_id,round_id) DO UPDATE SET revision=excluded.revision,active=true,revoked_at=NULL,revocation_reason=NULL,revision_invalidated=false
  WHERE judge_assignments.revision_invalidated AND judge_assignments.revision<excluded.revision RETURNING id`);return {assigned:rows.length};
}
export async function assignmentDetail(db:Db,actor:Actor,assignmentId:string,lock=false){
 const {rows:[a]}=await db.query(`SELECT a.*,r.name round_name,r.kind,r.eligible_states,r.open,r.rubric,r.rubric_version,r.decision_roles FROM judge_assignments a JOIN review_rounds r ON r.id=a.round_id WHERE a.id=$1 ${lock?'FOR UPDATE OF a,r':''}`,[assignmentId]);
 if(!a||a.judge_id!==actor.id||!a.active||a.revoked_at||!a.open)throw new AppError(404,'Active assignment not found.');
 const entry=await entryAccess(db,actor,a.submission_id);
 if(a.revision!==entry.revision||entry.state==='draft'||entry.edition_state==='archived'||entry.trashed_at||(lock&&!a.eligible_states.includes(entry.state)))throw new AppError(409,'This assignment is no longer open for review.');
 const {rows:[revision]}=await db.query('SELECT * FROM submission_revisions WHERE submission_id=$1 AND version=$2',[entry.id,a.revision]);
 const {rows:[review]}=await db.query('SELECT * FROM reviews WHERE assignment_id=$1 AND revision=$2',[a.id,a.revision]);
 const {rows:assets}=await db.query("SELECT id,original_name,mime_type,byte_size,revision FROM assets WHERE submission_id=$1 AND revision=$2 AND status='ready' AND trashed_at IS NULL AND id=ANY($3::uuid[])",[entry.id,a.revision,revision.asset_ids]);
 const {rows:[competition]}=await db.query('SELECT guidelines FROM competitions WHERE id=$1',[entry.competition_id]);
 // Explicit DTO excludes guardian, school and student identity, other assignments and scores.
 return {assignment:{id:a.id,revision:a.revision,round_id:a.round_id},entry:{id:entry.id,reference:entry.reference,category_id:entry.category_id,state:entry.state,title:entry.competition_title,guidelines:competition.guidelines},round:{id:a.round_id,name:a.round_name,kind:a.kind,rubric:a.rubric,rubric_version:a.rubric_version,decision_roles:a.decision_roles},review:review??null,assets:assets.map((asset,index)=>({...asset,original_name:`Submitted file ${index+1}`,status:'ready'})),revision:{version:revision.version,answers:revision.answers},internal:lock?{entry,a}:undefined};
}
const reviewSchema=z.object({scores:z.record(z.string(),z.number()).default({}),comment:z.string().max(10000).default(''),flag:z.string().max(2000).nullable().optional(),lockVersion:z.number().int().min(0).default(0)});
export async function saveReview(db:Db,actor:Actor,assignmentId:string,input:unknown,final:boolean){
 const v=reviewSchema.parse(input);
 return db.transaction(async tx=>{
  const {rows:[link]}=await tx.query('SELECT submission_id FROM judge_assignments WHERE id=$1',[assignmentId]);
  if(!link)throw new AppError(404,'Assignment not found.');
  await tx.query('SELECT id FROM submissions WHERE id=$1 FOR SHARE',[link.submission_id]);
  const detail=await assignmentDetail(tx,actor,assignmentId,true);
  const {rows:[user]}=await tx.query('SELECT active,role FROM users WHERE id=$1 FOR SHARE',[actor.id]);if(!user?.active||user.role!==actor.role)throw new AppError(401,'Account inactive or permissions changed.');
  if(detail.review?.status==='submitted')throw new AppError(409,'Submitted reviews are locked. Ask an administrator to reopen with a reason.');
  if((detail.review?.lock_version??0)!==v.lockVersion)throw new AppError(409,'The review changed in another tab. Reload it.');
  const rubric=rubricSchema.parse(detail.round.rubric);validateScores(rubric,v.scores,v.comment,final);
  const {rows:[review]}=await tx.query(`INSERT INTO reviews(id,assignment_id,revision,rubric_version,scores,comment,flag,status,submitted_at,lock_version)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $8='submitted' THEN now() ELSE NULL END,1)
    ON CONFLICT(assignment_id,revision) DO UPDATE SET scores=excluded.scores,comment=excluded.comment,flag=excluded.flag,status=excluded.status,submitted_at=excluded.submitted_at,lock_version=reviews.lock_version+1,updated_at=now() RETURNING *`,[detail.review?.id??id(),assignmentId,detail.assignment.revision,detail.round.rubric_version,JSON.stringify(v.scores),v.comment,v.flag??null,final?'submitted':'draft']);
  await audit(tx,actor,final?'review.submit':'review.save','reviews',review.id,{assignmentId,revision:review.revision,status:review.status,flagged:!!v.flag});return review;
 });
}
export async function assign(db:Db,actor:Actor,input:unknown){
 requireAdmin(actor);const v=z.object({entryIds:z.array(z.uuid()).min(1).max(200),judgeId:z.uuid(),roundId:z.uuid(),reason:z.string().min(3).max(1000),replaceJudgeId:z.uuid().optional(),keepHistoricalReviews:z.boolean().optional()}).parse(input);
 return db.transaction(async tx=>{
  const {rows:[judge]}=await tx.query("SELECT * FROM users WHERE id=$1 AND active AND role IN ('judge','admin','owner') FOR SHARE",[v.judgeId]);if(!judge)throw new AppError(422,'Select an active judge.');
  const {rows:[round]}=await tx.query('SELECT * FROM review_rounds WHERE id=$1 AND open FOR SHARE',[v.roundId]);if(!round)throw new AppError(422,'Select an open review round.');
  for(const entryId of [...v.entryIds].sort()){
   const entry=await entryAccess(tx,actor,entryId);if(entry.trashed_at||entry.state==='draft'||!round.eligible_states.includes(entry.state)||round.competition_id!==entry.competition_id||entry.edition_state==='archived')throw new AppError(422,'An entry is not eligible for this round.');
   if(v.replaceJudgeId){if(v.keepHistoricalReviews===undefined)throw new AppError(422,'Choose whether prior submitted reviews remain eligible for results.');
    await tx.query('UPDATE judge_assignments SET active=false,revoked_at=now(),revocation_reason=$4,revision_invalidated=false WHERE submission_id=$1 AND judge_id=$2 AND round_id=$3',[entryId,v.replaceJudgeId,v.roundId,v.reason]);
    await tx.query('UPDATE reviews SET eligible_for_results=$4 WHERE assignment_id IN(SELECT id FROM judge_assignments WHERE submission_id=$1 AND judge_id=$2 AND round_id=$3)',[entryId,v.replaceJudgeId,v.roundId,v.keepHistoricalReviews]);}
   await tx.query(`INSERT INTO judge_assignments(id,submission_id,judge_id,round_id,revision) VALUES($1,$2,$3,$4,$5) ON CONFLICT(submission_id,judge_id,round_id) DO UPDATE SET active=true,revoked_at=NULL,revocation_reason=NULL,revision=excluded.revision,revision_invalidated=false`,[id(),entryId,v.judgeId,v.roundId,entry.revision]);
   await audit(tx,actor,'assignment.assign','submissions',entryId,v);
  }return {assigned:v.entryIds.length};
 });
}
export async function recordDecision(db:Db,actor:Actor,input:unknown){
 const v=z.object({entryId:z.uuid(),roundId:z.uuid(),state:z.enum(['longlisted','disqualified','shortlisted','not_selected','finalized']),reason:z.string().trim().min(3).max(5000),juryReference:z.string().max(1000).default(''),award:z.string().max(300).optional()}).parse(input);
 return db.transaction(async tx=>{
  await tx.query('SELECT id FROM submissions WHERE id=$1 FOR UPDATE',[v.entryId]);const entry=await entryAccess(tx,actor,v.entryId);
  const {rows:[round]}=await tx.query('SELECT * FROM review_rounds WHERE id=$1 FOR SHARE',[v.roundId]);
  if(!round||!round.open||round.competition_id!==entry.competition_id||!round.eligible_states.includes(entry.state)||!round.decision_roles.includes(actor.role)||entry.trashed_at||entry.edition_state==='archived')throw new AppError(403,'This round does not authorize this decision.');
  if(actor.role==='judge'){const {rows}=await tx.query('SELECT 1 FROM judge_assignments WHERE submission_id=$1 AND round_id=$2 AND judge_id=$3 AND active AND revoked_at IS NULL AND revision=$4 FOR SHARE',[entry.id,round.id,actor.id,entry.revision]);if(!rows.length)throw new AppError(403,'An explicit assignment is required.');}
  else requireAdmin(actor);
  nextState(entry.state,v.state,round.kind,v.reason,v.juryReference);
  if(['shortlisted','finalized'].includes(v.state)){
   const prerequisiteIds=z.array(z.uuid()).min(1).safeParse(round.prerequisite_round_ids);
   if(!prerequisiteIds.success)throw new AppError(409,'Configure the jury round’s prerequisite scoring rounds before recording this decision.');
   const {rows:prerequisites}=await tx.query("SELECT id FROM review_rounds WHERE id=ANY($1::uuid[]) AND competition_id=$2 AND kind='scoring'",[prerequisiteIds.data,entry.competition_id]);
   if(prerequisites.length!==new Set(prerequisiteIds.data).size)throw new AppError(409,'The jury prerequisites must be scoring rounds for this competition.');
   const {rows:counts}=await tx.query("SELECT a.round_id,count(DISTINCT a.judge_id)::int count FROM reviews r JOIN judge_assignments a ON a.id=r.assignment_id WHERE a.submission_id=$1 AND r.revision=$2 AND r.status='submitted' AND r.eligible_for_results AND a.round_id=ANY($3::uuid[]) GROUP BY a.round_id",[entry.id,entry.revision,prerequisiteIds.data]);
   if(prerequisiteIds.data.some(source=>!counts.some(count=>count.round_id===source&&count.count>=round.required_reviews)))throw new AppError(409,'The required submitted reviews are not available for every prerequisite round. Record the agreed missing-review policy before proceeding.');
  }
  await tx.query('INSERT INTO decisions(id,submission_id,round_id,actor_id,from_state,to_state,reason,jury_reference,award,revision) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id(),entry.id,round.id,actor.id,entry.state,v.state,v.reason,v.juryReference,v.award??null,entry.revision]);
  await tx.query('UPDATE submissions SET state=$2,updated_at=now() WHERE id=$1',[entry.id,v.state]);
  await tx.query("INSERT INTO jobs(id,kind,payload) VALUES($1,'route',$2)",[id(),JSON.stringify({entryId:entry.id})]);await audit(tx,actor,'entry.decision','submissions',entry.id,v);return {state:v.state};
 });
}
export async function judgeQueue(db:Db,actor:Actor,params:URLSearchParams){
 const page=Math.max(1,Math.min(100000,Number(params.get('page'))||1));const status=params.get('status')??'';const q=(params.get('q')??'').slice(0,150);
 const where=`a.judge_id=$1 AND a.active AND a.revoked_at IS NULL AND rr.open AND a.revision=s.revision AND s.state<>'draft' AND s.trashed_at IS NULL AND NOT s.purging AND p.trashed_at IS NULL AND st.trashed_at IS NULL AND sc.trashed_at IS NULL AND e.state<>'archived' AND ($2='' OR s.reference ILIKE '%'||$2||'%' OR c.title ILIKE '%'||$2||'%') AND ($3='' OR CASE WHEN r.status='submitted' THEN 'submitted' WHEN r.id IS NOT NULL THEN 'in_progress' ELSE 'pending' END=$3)`;
 const from=`FROM judge_assignments a JOIN submissions s ON s.id=a.submission_id JOIN competitions c ON c.id=s.competition_id JOIN editions e ON e.id=c.edition_id JOIN review_rounds rr ON rr.id=a.round_id JOIN student_participations p ON p.id=s.student_participation_id JOIN students st ON st.id=p.student_id JOIN schools sc ON sc.id=p.school_id LEFT JOIN reviews r ON r.assignment_id=a.id AND r.revision=a.revision`;
 const {rows:items}=await db.query(`SELECT a.id,s.reference,c.title,s.category_id,rr.name round_name,CASE WHEN r.status='submitted' THEN 'submitted' WHEN r.id IS NOT NULL THEN 'in_progress' ELSE 'pending' END status ${from} WHERE ${where} ORDER BY a.created_at,a.id LIMIT 25 OFFSET $4`,[actor.id,q,status,(page-1)*25]);
 const {rows:[count]}=await db.query(`SELECT count(*)::int total ${from} WHERE ${where}`,[actor.id,q,status]);return {items,total:count.total,page,pageSize:25};
}
