import { z } from 'zod';
import type { Db } from './db';
import { AppError,type Actor,id,audit } from './core';
import { categoryFor,competitionSchema,validateAnswers } from '../domain/rules';
import { entryAccess } from './access';
import { anonymousFilename, ContentRejected, submissionLabel, validateFileSelection } from './storage/validation';
const answers=z.record(z.string(),z.unknown());
const draftSchema=z.object({answers:answers.default({}),memberIds:z.array(z.uuid()).max(99).default([]),currentStep:z.enum(['details','team','upload','review']).optional()});
async function validateMembers(tx:Db,actor:Actor,participation:any,competition:any,memberIds:string[],final=false,entryId:string|null=null){
  const config=competitionSchema.parse(competition.config);
  const ids=[participation.id,...memberIds];if(new Set(ids).size!==ids.length)throw new AppError(422,'A participant may appear only once in a team.');
  if(config.mode==='individual'&&memberIds.length||ids.length>config.maxMembers||final&&ids.length<config.minMembers)throw new AppError(422,'The team size does not match competition rules.');
  for(const memberId of memberIds){
    const {rows:[member]}=await tx.query(`SELECT p.* FROM student_participations p JOIN students s ON s.id=p.student_id JOIN schools sc ON sc.id=p.school_id WHERE p.id=$1 AND (EXISTS(SELECT 1 FROM participant_access a WHERE a.student_id=p.student_id AND a.user_id=$2) OR EXISTS(SELECT 1 FROM team_invitations i WHERE i.accepted_participation_id=p.id AND i.submission_id=$3 AND i.issued_by=$2)) AND p.trashed_at IS NULL AND s.trashed_at IS NULL AND sc.trashed_at IS NULL AND sc.status='active'`,[memberId,actor.id,entryId]);
    if(!member||member.edition_id!==competition.edition_id||(config.teamSchoolPolicy==='same_school'&&member.school_id!==participation.school_id)||(config.teamClassPolicy==='same_category'&&categoryFor(config.categories,member.class)!==categoryFor(config.categories,participation.class)))throw new AppError(422,'Team members must be authorized and meet the configured school and category rules.');
    categoryFor(config.categories,member.class);
  }
}
export async function createEntry(db:Db,actor:Actor,input:unknown){
 const v=draftSchema.extend({participationId:z.uuid(),competitionId:z.uuid()}).parse(input);
 if(actor.role!=='participant')throw new AppError(403,'Participant access required.');
 return db.transaction(async tx=>{
  const {rows:[p]}=await tx.query(`SELECT p.* FROM student_participations p JOIN participant_access a ON a.student_id=p.student_id JOIN students s ON s.id=p.student_id JOIN schools sc ON sc.id=p.school_id WHERE p.id=$1 AND a.user_id=$2 AND p.trashed_at IS NULL AND s.trashed_at IS NULL AND sc.trashed_at IS NULL AND sc.status='active' FOR SHARE OF p,s,sc`,[v.participationId,actor.id]);
  if(!p)throw new AppError(404,'Active student registration not found.');
  const {rows:[c]}=await tx.query("SELECT c.*,e.state edition_state FROM competitions c JOIN editions e ON e.id=c.edition_id WHERE c.id=$1 FOR SHARE OF c,e",[v.competitionId]);
  if(!c||c.edition_id!==p.edition_id||c.status!=='approved'||c.edition_state!=='open'||Date.now()<new Date(c.opens_at).getTime()||Date.now()>=new Date(c.closes_at).getTime())throw new AppError(409,'The competition is not open.');
  const config=competitionSchema.parse(c.config);validateAnswers(config.fields,v.answers,false,p.class);await validateMembers(tx,actor,p,c,v.memberIds);
  const {rows:[entry]}=await tx.query('INSERT INTO submissions(id,reference,student_participation_id,competition_id,category_id,answers) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[id(),`YES-${id().slice(0,12).toUpperCase()}`,p.id,c.id,categoryFor(config.categories,p.class),JSON.stringify(v.answers)]);
  for(const member of v.memberIds)await tx.query('INSERT INTO submission_members(submission_id,participation_id) VALUES($1,$2)',[entry.id,member]);
  await audit(tx,actor,'entry.draft','submissions',entry.id);return entry;
 });
}
export async function updateEntry(db:Db,actor:Actor,entryId:string,input:unknown){
 const v=draftSchema.extend({lockVersion:z.number().int().min(0)}).parse(input);
 return db.transaction(async tx=>{
  await tx.query('SELECT id FROM submissions WHERE id=$1 FOR UPDATE',[entryId]);const entry=await entryAccess(tx,actor,entryId,true);
  if(entry.lock_version!==v.lockVersion)throw new AppError(409,'This draft changed in another tab. Reload before saving.');
  validateAnswers(competitionSchema.parse(entry.config).fields,v.answers,false,entry.class);
  if(v.currentStep==='team'&&entry.config.mode!=='team')throw new AppError(422,'This entry does not have a team step.');
  await validateMembers(tx,actor,{id:entry.student_participation_id,school_id:entry.school_id,class:entry.class},entry,v.memberIds,false,entryId);
  await tx.query('DELETE FROM submission_members WHERE submission_id=$1',[entryId]);for(const member of v.memberIds)await tx.query('INSERT INTO submission_members(submission_id,participation_id) VALUES($1,$2)',[entryId,member]);
  const {rows:[updated]}=await tx.query('UPDATE submissions SET answers=$2,current_step=COALESCE($3,current_step),lock_version=lock_version+1,updated_at=now() WHERE id=$1 RETURNING *',[entryId,JSON.stringify(v.answers),v.currentStep??null]);return updated;
 });
}
export async function submitEntry(db:Db,actor:Actor,entryId:string,lockVersion:number){
 return db.transaction(async tx=>{
  await tx.query('SELECT id FROM submissions WHERE id=$1 FOR UPDATE',[entryId]);const entry=await entryAccess(tx,actor,entryId);
  if(actor.role!=='participant')throw new AppError(403,'Participant access required.');
  if(entry.state!=='draft')return {id:entry.id,reference:entry.reference,state:entry.state,revision:entry.revision};
  if(entry.lock_version!==lockVersion)throw new AppError(409,'This draft changed. Review the latest version before submitting.');
  await entryAccess(tx,actor,entryId,true);
  if(entry.competition_status!=='approved'||entry.edition_state!=='open'||Date.now()<new Date(entry.opens_at).getTime()||Date.now()>=new Date(entry.closes_at).getTime())throw new AppError(409,'Submissions are closed.');
  const config=competitionSchema.parse(entry.config);if(categoryFor(config.categories,entry.class)!==entry.category_id)throw new AppError(422,'The category does not match the registered class.');validateAnswers(config.fields,entry.answers,true,entry.class);
  const {rows:members}=await tx.query('SELECT participation_id FROM submission_members WHERE submission_id=$1',[entryId]);
  await validateMembers(tx,actor,{id:entry.student_participation_id,school_id:entry.school_id,class:entry.class},entry,members.map(m=>m.participation_id),true,entryId);
  const participants=[entry.student_participation_id,...members.map(m=>m.participation_id)].sort();
  // Stable row-lock order serializes the limit across concurrent entries and teams.
  for(const pid of participants)await tx.query('SELECT id FROM student_participations WHERE id=$1 FOR UPDATE',[pid]);
  for(const pid of participants){const {rows:[parent]}=await tx.query("SELECT p.id FROM student_participations p JOIN students st ON st.id=p.student_id JOIN schools sc ON sc.id=p.school_id WHERE p.id=$1 AND p.trashed_at IS NULL AND st.trashed_at IS NULL AND NOT st.purging AND sc.trashed_at IS NULL AND NOT sc.purging AND sc.status='active' FOR SHARE OF st,sc",[pid]);if(!parent)throw new AppError(409,'A team registration is no longer active.');}
  const {rows:[current]}=await tx.query("SELECT c.status,c.opens_at,c.closes_at,e.state FROM competitions c JOIN editions e ON e.id=c.edition_id WHERE c.id=$1 FOR SHARE OF c,e",[entry.competition_id]);
  if(current.status!=='approved'||current.state!=='open'||Date.now()<new Date(current.opens_at).getTime()||Date.now()>=new Date(current.closes_at).getTime())throw new AppError(409,'Submissions are closed.');
  if(config.entryLimit!==null)for(const pid of participants){const {rows:[count]}=await tx.query(`SELECT count(*)::int count FROM submissions s WHERE s.competition_id=$1 AND s.id<>$2 AND s.revision>0 AND (s.student_participation_id=$3 OR EXISTS(SELECT 1 FROM submission_members m WHERE m.submission_id=s.id AND m.participation_id=$3))`,[entry.competition_id,entryId,pid]);if(count.count>=config.entryLimit)throw new AppError(409,'The competition entry limit has been reached for a team member.');}
  const version=entry.revision+1;const {rows:assets}=await tx.query('SELECT * FROM assets WHERE submission_id=$1 AND revision=$2 AND trashed_at IS NULL FOR UPDATE',[entryId,version]);
  try{validateFileSelection(config.files,assets,true);}catch(error){if(error instanceof ContentRejected)throw new AppError(422,error.message);throw error;}
  let generatedTitle:string|null=null;
  if(config.naming){
    const {rows:authors}=await tx.query('SELECT p.class,p.section,p.snapshot,st.name,sc.name school_name FROM student_participations p JOIN students st ON st.id=p.student_id JOIN schools sc ON sc.id=p.school_id WHERE p.id=ANY($1::uuid[]) ORDER BY CASE WHEN p.id=$2 THEN 0 ELSE 1 END,p.id',[participants,entry.student_participation_id]);
    const lead=authors[0];
    generatedTitle=submissionLabel([lead.snapshot?.school?.name||lead.school_name,`${entry.class}${lead.section||''}`,entry.competition_title,String(entry.answers.title??''),authors.map(a=>a.snapshot?.studentName||a.name).join('_')]);
    for(const asset of assets){const suffix=anonymousFilename(asset.mime_type).split('.').at(-1);await tx.query('UPDATE assets SET generated_name=$2 WHERE id=$1',[asset.id,`${generatedTitle}${asset.role?'_'+asset.role:''}.${suffix}`]);}
  }
  await tx.query('INSERT INTO submission_revisions(id,submission_id,version,answers,context,asset_ids,config,submitted_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id(),entryId,version,JSON.stringify(entry.answers),JSON.stringify({...entry.snapshot,submissionTitle:generatedTitle,memberParticipationIds:members.map(m=>m.participation_id)}),JSON.stringify(assets.map(a=>a.id)),JSON.stringify(config),actor.id]);
  const {rows:[saved]}=await tx.query("UPDATE submissions SET state='submitted',revision=$2,submission_title=$3,current_step='review',submitted_at=now(),lock_version=lock_version+1,updated_at=now() WHERE id=$1 RETURNING id,reference,state,revision",[entryId,version,generatedTitle]);
  await tx.query("INSERT INTO jobs(id,kind,payload) VALUES($1,'route',$2)",[id(),JSON.stringify({entryId})]);await audit(tx,actor,'entry.submit','submissions',entryId,{revision:version});return saved;
 });
}
export async function entryDetail(db:Db,actor:Actor,entryId:string){
 const entry=await entryAccess(db,actor,entryId);if(actor.role==='judge')throw new AppError(403,'Use your assigned judging view.');
 const [assets,revisions,decisions,assignments,reviews,members]=await Promise.all([
  db.query('SELECT a.id,a.original_name,a.generated_name,a.role,a.metadata,a.mime_type,a.byte_size,a.status,a.revision,a.created_at FROM assets a WHERE a.submission_id=$1 AND a.trashed_at IS NULL AND ($2 OR a.revision>$3 OR EXISTS(SELECT 1 FROM submission_revisions r WHERE r.submission_id=a.submission_id AND r.version=a.revision AND r.asset_ids ? a.id::text)) ORDER BY a.created_at',[entryId,['owner','admin'].includes(actor.role),entry.revision]),
  db.query('SELECT * FROM submission_revisions WHERE submission_id=$1 ORDER BY version DESC',[entryId]),
  ['owner','admin'].includes(actor.role)?db.query('SELECT * FROM decisions WHERE submission_id=$1 ORDER BY created_at',[entryId]):Promise.resolve({rows:[]}),
  ['owner','admin'].includes(actor.role)?db.query('SELECT a.*,u.name judge_name FROM judge_assignments a JOIN users u ON u.id=a.judge_id WHERE a.submission_id=$1',[entryId]):Promise.resolve({rows:[]}),
  ['owner','admin'].includes(actor.role)?db.query("SELECT r.* FROM reviews r JOIN judge_assignments a ON a.id=r.assignment_id WHERE a.submission_id=$1 AND r.status='submitted'",[entryId]):Promise.resolve({rows:[]}),
  db.query('SELECT participation_id FROM submission_members WHERE submission_id=$1',[entryId])]);
 const {rows:leadAccess}=await db.query('SELECT 1 FROM participant_access WHERE user_id=$1 AND student_id=$2',[actor.id,entry.student_id]);
 const {rows:[competition]}=await db.query('SELECT id,title,guidelines,config FROM competitions WHERE id=$1',[entry.competition_id]);
 return {entry:{...entry,canEdit:actor.role==='participant'&&leadAccess.length>0&&entry.state==='draft',memberIds:members.rows.map(x=>x.participation_id)} as Record<string,any>,assets:assets.rows,revisions:revisions.rows,decisions:decisions.rows,assignments:assignments.rows,reviews:reviews.rows,competition};
}
