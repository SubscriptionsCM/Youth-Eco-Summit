import { z } from 'zod';
import type { Db } from './db';
import { AppError,type Actor,id,audit,requireAdmin } from './core';
import { competitionSchema,rubricSchema } from '../domain/rules';
import { assign,recordDecision } from './judging';
export async function overview(db:Db,edition:string){
 const {rows:[counts]}=await db.query(`SELECT
 (SELECT count(*)::int FROM school_participations p JOIN schools s ON s.id=p.school_id WHERE ($1='' OR p.edition_id::text=$1) AND p.trashed_at IS NULL AND s.trashed_at IS NULL) registered_school_participations,
 (SELECT count(*)::int FROM student_participations p JOIN students s ON s.id=p.student_id WHERE ($1='' OR p.edition_id::text=$1) AND p.trashed_at IS NULL AND s.trashed_at IS NULL) student_participations,
 (SELECT count(*)::int FROM submissions s JOIN competitions c ON c.id=s.competition_id WHERE ($1='' OR c.edition_id::text=$1) AND s.trashed_at IS NULL AND s.state<>'draft') finalized_entries,
 (SELECT count(*)::int FROM assets a JOIN submissions s ON s.id=a.submission_id JOIN competitions c ON c.id=s.competition_id WHERE ($1='' OR c.edition_id::text=$1) AND a.status='ready' AND s.trashed_at IS NULL AND a.trashed_at IS NULL) retained_files,
 (SELECT count(*)::int FROM assets a JOIN submissions s ON s.id=a.submission_id JOIN competitions c ON c.id=s.competition_id WHERE ($1='' OR c.edition_id::text=$1) AND a.status IN ('failed','quarantined')) upload_failures,
 (SELECT count(*)::int FROM submissions s JOIN competitions c ON c.id=s.competition_id WHERE ($1='' OR c.edition_id::text=$1) AND s.trashed_at IS NULL AND s.state IN ('submitted','longlisted','shortlisted') AND NOT EXISTS(SELECT 1 FROM judge_assignments a JOIN review_rounds rr ON rr.id=a.round_id JOIN users u ON u.id=a.judge_id WHERE a.submission_id=s.id AND a.active AND a.revoked_at IS NULL AND a.revision=s.revision AND rr.open AND u.active)) unassigned_entries,
 (SELECT count(*)::int FROM reviews r JOIN judge_assignments a ON a.id=r.assignment_id JOIN submissions s ON s.id=a.submission_id JOIN competitions c ON c.id=s.competition_id WHERE ($1='' OR c.edition_id::text=$1) AND r.status='submitted' AND r.revision=s.revision AND s.trashed_at IS NULL) submitted_reviews,
 (SELECT count(*)::int FROM submissions s JOIN competitions c ON c.id=s.competition_id WHERE ($1='' OR c.edition_id::text=$1) AND s.state='shortlisted' AND s.trashed_at IS NULL) shortlisted_entries,
 (SELECT count(*)::int FROM deletion_batches WHERE status IN ('trashed','purging','purge_failed')) trash_batches_all_editions,
 (SELECT count(*)::int FROM jobs WHERE status='failed') failed_jobs_all_editions,
 (SELECT coalesce(sum(byte_size),0)::text FROM assets) retained_bytes_all_editions`,[edition]);return counts;
}
// These expanded records are available only behind adminList's role check.
// Contact verification follows explicit access links, never a name/phone match.
const studentDetails=`t.*,
 COALESCE((SELECT jsonb_agg(d ORDER BY d.created_at DESC,d.id) FROM (
  SELECT p.id,p.edition_id,e.label edition_label,p.school_id,s.name school_name,s.reference school_reference,
   p.class,p.section,p.coordinator,p.snapshot,p.created_at,p.trashed_at
  FROM student_participations p JOIN editions e ON e.id=p.edition_id JOIN schools s ON s.id=p.school_id WHERE p.student_id=t.id
 ) d),'[]'::jsonb) participations,
 COALESCE((SELECT jsonb_agg(d ORDER BY d.created_at DESC,d.id) FROM (
  SELECT c.id,c.edition_id,e.label edition_label,c.actor_id,u.name actor_name,c.purpose,c.wording_version,c.wording,c.accepted,c.created_at
  FROM consents c JOIN editions e ON e.id=c.edition_id JOIN users u ON u.id=c.actor_id WHERE c.student_id=t.id
 ) d),'[]'::jsonb) consents,
 COALESCE((SELECT jsonb_agg(v ORDER BY v.verified_at DESC,v.id) FROM contact_verifications v
  WHERE EXISTS(SELECT 1 FROM participant_access a WHERE a.student_id=t.id AND a.user_id=v.user_id)),'[]'::jsonb) contact_verifications,
 COALESCE((SELECT jsonb_agg(d ORDER BY d.created_at DESC,d.id) FROM (
  SELECT s.id,s.reference,c.title,s.competition_id,c.edition_id,e.label edition_label,p.school_id,s.state,s.revision,
   s.submitted_at,s.created_at,s.trashed_at,s.purging,CASE WHEN p.student_id=t.id THEN 'lead' ELSE 'member' END participation_role,
   '/entries/'||s.id::text entry_url
  FROM submissions s JOIN student_participations p ON p.id=s.student_participation_id
   JOIN competitions c ON c.id=s.competition_id JOIN editions e ON e.id=c.edition_id
  WHERE p.student_id=t.id OR EXISTS(SELECT 1 FROM submission_members m JOIN student_participations mp ON mp.id=m.participation_id WHERE m.submission_id=s.id AND mp.student_id=t.id)
 ) d),'[]'::jsonb) entries`;
const schoolDetails=`t.*,t.postal_code "postalCode",
 COALESCE((SELECT jsonb_agg(c ORDER BY c.created_at,c.id) FROM school_contacts c WHERE c.school_id=t.id),'[]'::jsonb) contacts,
 (SELECT c.name FROM school_contacts c WHERE c.school_id=t.id ORDER BY c.created_at,c.id LIMIT 1) "contactName",
 (SELECT c.role FROM school_contacts c WHERE c.school_id=t.id ORDER BY c.created_at,c.id LIMIT 1) "contactRole",
 (SELECT c.email FROM school_contacts c WHERE c.school_id=t.id ORDER BY c.created_at,c.id LIMIT 1) email,
 (SELECT c.phone FROM school_contacts c WHERE c.school_id=t.id ORDER BY c.created_at,c.id LIMIT 1) phone,
 '/admin/students?schoolId='||t.id::text students_url,'/admin/entries?schoolId='||t.id::text entries_url,
 COALESCE((SELECT jsonb_agg(d ORDER BY d.created_at DESC,d.id) FROM (
  SELECT p.id,p.edition_id,e.label edition_label,p.snapshot,p.created_at,p.trashed_at,
   (SELECT count(*)::int FROM student_participations sp JOIN students st ON st.id=sp.student_id WHERE sp.school_id=t.id AND sp.edition_id=p.edition_id AND sp.trashed_at IS NULL AND st.trashed_at IS NULL) student_count,
   (SELECT count(*)::int FROM submissions s JOIN student_participations sp ON sp.id=s.student_participation_id JOIN competitions c ON c.id=s.competition_id WHERE sp.school_id=t.id AND c.edition_id=p.edition_id AND s.trashed_at IS NULL) entry_count,
   '/admin/students?schoolId='||t.id::text||'&editionId='||p.edition_id::text students_url,
   '/admin/entries?schoolId='||t.id::text||'&editionId='||p.edition_id::text entries_url
  FROM school_participations p JOIN editions e ON e.id=p.edition_id WHERE p.school_id=t.id
 ) d),'[]'::jsonb) participations`;
const reviewStatus="CASE WHEN r.status='submitted' THEN 'submitted' WHEN r.status='draft' THEN 'in_progress' ELSE 'pending' END";
const assignmentDetails=`t.*,s.reference,u.name judge_name,rr.name round_name,c.title competition_title,c.edition_id,
 ${reviewStatus} review_status,COALESCE(r.status='submitted',false) completed,
 CASE WHEN NOT t.active OR t.revoked_at IS NOT NULL THEN 'revoked' ELSE ${reviewStatus} END status,
 r.id review_id,r.submitted_at review_submitted_at,r.revision review_revision,r.eligible_for_results review_eligible_for_results,
 '/entries/'||s.id::text entry_url`;
const reviewDetails=`t.*,s.reference,a.judge_id,a.round_id,c.edition_id,c.title competition_title,'/entries/'||s.id::text entry_url,
 COALESCE((SELECT jsonb_agg(d ORDER BY d.created_at DESC,d.id) FROM (
  SELECT h.id,h.review_id,h.snapshot,h.reason,h.actor_id,u.name actor_name,h.created_at
  FROM review_history h JOIN users u ON u.id=h.actor_id WHERE h.review_id=t.id
 ) d),'[]'::jsonb) history`;
const resources:Record<string,{from:string;select:string;search:string;where?:string;order:string}>={
 schools:{from:'schools t',select:schoolDetails,search:"t.name||' '||t.reference||' '||t.city||' '||t.state",where:'t.trashed_at IS NULL',order:'t.registered_at'},
 teachers:{from:'teacher_registrations t JOIN schools sc ON sc.id=t.school_id',select:'t.*,sc.name school_name,sc.reference school_reference',search:"t.name||' '||t.email||' '||t.reference||' '||sc.name",order:'t.created_at'},
 'partner-enquiries':{from:'partner_enquiries t',select:'t.*',search:"t.organization||' '||t.contact_name||' '||t.email||' '||t.reference",order:'t.created_at'},
 nominations:{from:'school_nominations t',select:'t.*',search:"t.name||' '||t.reference||' '||t.city",order:'t.created_at'},
 students:{from:'students t',select:studentDetails,search:"t.name||' '||t.reference||' '||t.guardian_contact",where:'t.trashed_at IS NULL',order:'t.created_at'},
 entries:{from:'submissions t JOIN competitions c ON c.id=t.competition_id JOIN student_participations p ON p.id=t.student_participation_id JOIN students st ON st.id=p.student_id JOIN schools sc ON sc.id=p.school_id',select:'t.*,c.title,c.edition_id,p.school_id,p.class,st.name student_name,sc.name school_name',search:"t.reference||' '||c.title||' '||st.name||' '||sc.name",where:'t.trashed_at IS NULL',order:'t.created_at'},
 judges:{from:'users t',select:'t.id,t.name,t.contact,t.role,t.active,t.created_at,(SELECT count(*)::int FROM judge_assignments a WHERE a.judge_id=t.id AND a.active) assigned_count,(SELECT count(*)::int FROM reviews r JOIN judge_assignments a ON a.id=r.assignment_id WHERE a.judge_id=t.id AND r.status=\'submitted\') completed_count',search:"t.name||' '||t.contact",where:"t.role IN ('judge','admin','owner')",order:'t.created_at'},
 assignments:{from:'judge_assignments t JOIN submissions s ON s.id=t.submission_id JOIN users u ON u.id=t.judge_id JOIN review_rounds rr ON rr.id=t.round_id JOIN competitions c ON c.id=s.competition_id LEFT JOIN reviews r ON r.assignment_id=t.id AND r.revision=t.revision',select:assignmentDetails,search:"s.reference||' '||u.name",order:'t.created_at'},
 rules:{from:'assignment_rules t',select:'t.*',search:'t.category_id',order:'t.created_at'},
 rounds:{from:'review_rounds t',select:'t.*',search:'t.name',order:'t.created_at'},
 results:{from:"decisions t JOIN submissions s ON s.id=t.submission_id",select:'t.*,s.reference',search:"s.reference||' '||coalesce(t.award,'')",where:'s.trashed_at IS NULL',order:'t.created_at'},
 trash:{from:'deletion_batches t',select:'t.*',search:"t.root_type||' '||t.root_id::text||' '||t.reason",where:"t.status IN ('trashed','purging','purge_failed')",order:'t.created_at'},
 audit:{from:'audit_events t',select:'t.*',search:"t.entity_id||' '||t.action",order:'t.created_at'},
 jobs:{from:'jobs t',select:'t.*',search:'t.kind',order:'t.created_at'},
 imports:{from:'import_rows t',select:'t.*',search:"t.source||' '||t.source_id",order:'t.created_at'},
 files:{from:'assets t JOIN submissions s ON s.id=t.submission_id',select:'t.id,t.submission_id,t.original_name,t.mime_type,t.byte_size,t.status,t.revision,t.trashed_at,t.error,t.created_at,s.reference,(t.trashed_at IS NOT NULL AND t.revision<=s.revision) can_recover_archival',search:"t.original_name||' '||s.reference",order:'t.created_at'},
 repairs:{from:'historical_file_refs t JOIN submissions s ON s.id=t.submission_id',select:'t.*,s.reference',search:'s.reference',order:'t.created_at'},
 editions:{from:'editions t',select:'t.*',search:'t.label',order:'t.created_at'},
 competitions:{from:'competitions t',select:'t.*',search:'t.title',order:'t.created_at'},
 content:{from:'site_content t',select:'t.key id,t.*',search:'t.title',order:'t.updated_at'},
 reviews:{from:"reviews t JOIN judge_assignments a ON a.id=t.assignment_id JOIN submissions s ON s.id=a.submission_id JOIN competitions c ON c.id=s.competition_id",select:reviewDetails,search:'s.reference',where:"t.status='submitted' AND s.trashed_at IS NULL",order:'t.created_at'}
};
export async function adminList(db:Db,actor:Actor,resource:string,params:URLSearchParams){
 requireAdmin(actor);if(resource==='overview')return overview(db,params.get('editionId')??'');
 const r=resources[resource];if(!r)throw new AppError(404,'Resource not found.');
 const page=Math.max(1,Math.min(100000,Math.floor(Number(params.get('page'))||1)));const pageSize=Math.max(1,Math.min(100,Math.floor(Number(params.get('pageSize'))||25)));
 const values:unknown[]=[];const where=[r.where??'true'];const add=(clause:string,value:unknown)=>{values.push(value);where.push(clause.replace('?',`$${values.length}`));};
 if(params.get('q'))add(`(${r.search}) ILIKE '%'||?||'%'`,params.get('q')!.slice(0,200));
 if(params.get('id'))add('t.id::text=?',params.get('id'));
 if(resource==='entries'){
  for(const [param,col] of Object.entries({editionId:'c.edition_id',competitionId:'t.competition_id',categoryId:'t.category_id',schoolId:'p.school_id',class:'p.class',state:'t.state'}))if(params.get(param))add(`${col}::text=?`,params.get(param));
  if(params.get('judgeId'))add('EXISTS(SELECT 1 FROM judge_assignments a WHERE a.submission_id=t.id AND a.judge_id::text=? AND a.active AND a.revoked_at IS NULL)',params.get('judgeId'));
  if(params.get('assignment')==='unassigned')where.push('NOT EXISTS(SELECT 1 FROM judge_assignments a JOIN review_rounds rr ON rr.id=a.round_id JOIN users u ON u.id=a.judge_id WHERE a.submission_id=t.id AND a.active AND a.revoked_at IS NULL AND rr.open AND u.active AND a.revision=t.revision)');
  if(params.get('reviewStatus'))add('EXISTS(SELECT 1 FROM reviews r JOIN judge_assignments a ON a.id=r.assignment_id WHERE a.submission_id=t.id AND r.status=? AND r.revision=t.revision)',params.get('reviewStatus'));
  if(params.get('fileStatus'))add('EXISTS(SELECT 1 FROM assets a WHERE a.submission_id=t.id AND a.revision=t.revision AND a.status=?)',params.get('fileStatus'));
 }
 if(resource==='students'){
  const participationFilters:string[]=[];
  for(const [param,col] of Object.entries({schoolId:'school_id',editionId:'edition_id',class:'class'}))if(params.get(param)){
   values.push(params.get(param));participationFilters.push(`p.${col}::text=$${values.length}`);
  }
  if(participationFilters.length)where.push(`EXISTS(SELECT 1 FROM student_participations p WHERE p.student_id=t.id AND p.trashed_at IS NULL AND ${participationFilters.join(' AND ')})`);
 }
 if(resource==='reviews'&&params.get('editionId'))add('c.edition_id::text=?',params.get('editionId'));
 if(resource==='assignments'){
  for(const [param,col] of Object.entries({editionId:'c.edition_id',judgeId:'t.judge_id',roundId:'t.round_id'}))if(params.get(param))add(`${col}::text=?`,params.get(param));
  if(params.get('reviewStatus'))add(`(${reviewStatus})=?`,params.get('reviewStatus'));
 }
 if(resource==='schools'&&params.get('city'))add("t.city ILIKE '%'||?||'%'",params.get('city'));
 const filter=where.join(' AND ');const {rows:[count]}=await db.query(`SELECT count(*)::int total FROM ${r.from} WHERE ${filter}`,values);
 const {rows:items}=await db.query(`SELECT ${r.select} FROM ${r.from} WHERE ${filter} ORDER BY ${r.order} DESC LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,pageSize,(page-1)*pageSize]);return {items,total:count.total,page,pageSize};
}
const iso=z.iso.datetime({offset:true});
export async function adminCreate(db:Db,actor:Actor,resource:string,input:unknown){
 requireAdmin(actor);
 if(resource==='assignments')return assign(db,actor,input);
 if(resource==='results')return recordDecision(db,actor,input);
 return db.transaction(async tx=>{
  let row;
  if(resource==='editions'){
   const v=z.object({label:z.string().trim().min(2).max(100),state:z.enum(['draft','open','closed','archived']).default('draft'),registrationOpens:iso.nullable().default(null),registrationCloses:iso.nullable().default(null),eventDate:iso.nullable().default(null),config:z.object({registrationApproved:z.boolean().default(false),consentVersion:z.string().default(''),consentText:z.string().default(''),publicationConsentVersion:z.string().default(''),publicationConsentText:z.string().default(''),schoolVerificationApproved:z.boolean().default(false)}).default({registrationApproved:false,consentVersion:'',consentText:'',publicationConsentVersion:'',publicationConsentText:'',schoolVerificationApproved:false})}).parse(input);
   if(v.state==='open'&&(!v.config.registrationApproved||!v.config.consentVersion||!v.config.consentText||!v.registrationOpens||!v.registrationCloses||new Date(v.registrationCloses)<=new Date(v.registrationOpens)))throw new AppError(422,'Approve consent and registration dates before opening an edition.');
   ({rows:[row]}=await tx.query('INSERT INTO editions(id,label,state,registration_opens,registration_closes,event_date,config) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[id(),v.label,v.state,v.registrationOpens,v.registrationCloses,v.eventDate,JSON.stringify(v.config)]));
  }else if(resource==='competitions'){
   const v=z.object({editionId:z.uuid(),slug:z.string().regex(/^[a-z0-9-]+$/),title:z.string().min(2).max(200),guidelines:z.string().min(5).max(30000),opensAt:iso,closesAt:iso,version:z.number().int().positive().default(1),config:competitionSchema}).parse(input);
   ({rows:[row]}=await tx.query('INSERT INTO competitions(id,edition_id,slug,title,guidelines,opens_at,closes_at,version,config) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[id(),v.editionId,v.slug,v.title,v.guidelines,v.opensAt,v.closesAt,v.version,JSON.stringify(v.config)]));
  }else if(resource==='rounds'){
   const v=z.object({competitionId:z.uuid(),name:z.string().min(2).max(100),kind:z.enum(['screening','scoring','jury']),eligibleStates:z.array(z.enum(['submitted','longlisted','shortlisted'])).min(1),rubric:rubricSchema,decisionRoles:z.array(z.enum(['owner','admin','judge'])).min(1),requiredReviews:z.number().int().min(1).max(20),open:z.boolean().default(false),prerequisiteRoundIds:z.array(z.uuid()).max(100).default([])}).parse(input);
   const prerequisites=[...new Set(v.prerequisiteRoundIds)];
   if(prerequisites.length){
    const {rows:valid}=await tx.query("SELECT id FROM review_rounds WHERE competition_id=$1 AND kind='scoring' AND id=ANY($2::uuid[])",[v.competitionId,prerequisites]);
    if(valid.length!==prerequisites.length)throw new AppError(422,'Prerequisites must be scoring rounds from this competition.');
   }
   ({rows:[row]}=await tx.query('INSERT INTO review_rounds(id,competition_id,name,kind,eligible_states,rubric,decision_roles,required_reviews,open,prerequisite_round_ids) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',[id(),v.competitionId,v.name,v.kind,JSON.stringify(v.eligibleStates),JSON.stringify(v.rubric),JSON.stringify(v.decisionRoles),v.requiredReviews,v.open,JSON.stringify(prerequisites)]));
  }else if(resource==='rules'){
   const v=z.object({competitionId:z.uuid(),categoryId:z.string(),roundId:z.uuid(),judgeId:z.uuid()}).parse(input);
   const {rows:[valid]}=await tx.query("SELECT c.config FROM competitions c JOIN review_rounds r ON r.competition_id=c.id JOIN users u ON u.id=$3 WHERE c.id=$1 AND r.id=$2 AND u.active AND u.role IN ('owner','admin','judge')",[v.competitionId,v.roundId,v.judgeId]);
   if(!valid||!valid.config.categories.some((c:any)=>c.id===v.categoryId))throw new AppError(422,'The rule must match the competition, category, round and active judge.');
   ({rows:[row]}=await tx.query('INSERT INTO assignment_rules(id,competition_id,category_id,round_id,judge_id) VALUES($1,$2,$3,$4,$5) RETURNING *',[id(),v.competitionId,v.categoryId,v.roundId,v.judgeId]));
   await tx.query("INSERT INTO jobs(id,kind,payload) VALUES($1,'route','{}')",[id()]);
  }else if(resource==='content'){
   const v=z.object({key:z.string().regex(/^[a-z0-9_-]+$/),title:z.string().min(1).max(200),body:z.string().max(100000),approved:z.boolean().default(false)}).parse(input);
   ({rows:[row]}=await tx.query('INSERT INTO site_content(key,title,body,approved) VALUES($1,$2,$3,$4) ON CONFLICT(key) DO UPDATE SET title=excluded.title,body=excluded.body,approved=excluded.approved,updated_at=now() RETURNING *',[v.key,v.title,v.body,v.approved]));
  }else throw new AppError(404,'This resource cannot be created here.');
  await audit(tx,actor,'admin.create',resource,row.id??row.key,{after:row});return row;
 });
}
export async function adminPatch(db:Db,actor:Actor,resource:string,recordId:string,input:unknown){
 requireAdmin(actor);const v=z.object({action:z.string().min(1),reason:z.string().trim().min(3).max(2000)}).passthrough().parse(input);
 return db.transaction(async tx=>{
  let result:unknown={updated:true};
  if(resource==='partner-enquiries'){
   if(!['new','contacted','closed'].includes(v.action))throw new AppError(422,'Choose new, contacted or closed.');
   const {rows:[enquiry]}=await tx.query('UPDATE partner_enquiries SET status=$2,updated_at=now() WHERE id=$1 RETURNING id,status',[recordId,v.action]);
   if(!enquiry)throw new AppError(404,'Partner enquiry not found.');
   result=enquiry;
  }else if(resource==='students'){
   if(v.action!=='correct')throw new AppError(422,'Choose a support correction.');
   const patch=z.object({name:z.string().trim().min(2).max(150),emergencyContact:z.string().regex(/^\+[1-9]\d{7,14}$/).nullable().optional()}).parse(v);
   const {rows:[student]}=await tx.query('SELECT * FROM students WHERE id=$1 AND trashed_at IS NULL FOR UPDATE',[recordId]);if(!student)throw new AppError(404,'Student not found.');
   await audit(tx,actor,'student.support_correction','students',recordId,{before:student,after:patch,reason:v.reason});
   await tx.query('UPDATE students SET name=$2,emergency_contact=$3,updated_at=now() WHERE id=$1',[recordId,patch.name,patch.emergencyContact??student.emergency_contact]);
  }else if(resource==='schools'){
   if(!['approve','deactivate','activate'].includes(v.action))throw new AppError(422,'Choose approve, activate or deactivate.');
   const {rows:[before]}=await tx.query('SELECT * FROM schools WHERE id=$1 AND trashed_at IS NULL FOR UPDATE',[recordId]);if(!before)throw new AppError(404,'School not found.');
   await tx.query('UPDATE schools SET status=$2,updated_at=now() WHERE id=$1',[recordId,v.action==='deactivate'?'inactive':'active']);
   if(v.action==='approve')await tx.query('UPDATE school_contacts c SET verified_at=now() FROM users u WHERE c.school_id=$1 AND c.user_id=u.id AND u.contact=c.phone AND u.active',[recordId]);
   await audit(tx,actor,'school.status','schools',recordId,{before,action:v.action,verificationEvidence:v.reason});
  }else if(resource==='nominations'){
   const schoolId=z.uuid().parse(v.schoolId);await tx.query('UPDATE school_nominations SET status=$2,matched_school_id=$3,review_note=$4 WHERE id=$1',[recordId,'reviewed',schoolId,v.reason]);
  }else if(resource==='judges'){
   const {rows:[target]}=await tx.query('SELECT role FROM users WHERE id=$1 FOR UPDATE',[recordId]);
   if(!target||actor.id===recordId||(actor.role!=='owner'&&target.role!=='judge'))throw new AppError(403,'Only the owner manages privileged accounts. Administrators may manage judges.');
   if(!['deactivate','activate'].includes(v.action))throw new AppError(422,'Invalid account action.');
   await tx.query('UPDATE users SET active=$2,auth_version=auth_version+1,updated_at=now() WHERE id=$1',[recordId,v.action==='activate']);
   await tx.query('DELETE FROM auth_sessions WHERE user_id=$1',[recordId]);
  }else if(resource==='rules'){
   if(!['pause','resume'].includes(v.action))throw new AppError(422,'Choose pause or resume.');await tx.query('UPDATE assignment_rules SET active=$2 WHERE id=$1',[recordId,v.action==='resume']);
   if(v.action==='resume')await tx.query("INSERT INTO jobs(id,kind,payload) VALUES($1,'route','{}')",[id()]);
  }else if(resource==='assignments'){
   if(v.action!=='revoke')throw new AppError(422,'Use assignment creation for reassignment.');await tx.query('UPDATE judge_assignments SET active=false,revoked_at=now(),revocation_reason=$2,revision_invalidated=false WHERE id=$1',[recordId,v.reason]);
  }else if(resource==='rounds'){
   if(!['open','close'].includes(v.action))throw new AppError(422,'Create a new round to change the versioned rubric.');await tx.query('UPDATE review_rounds SET open=$2 WHERE id=$1',[recordId,v.action==='open']);
   if(v.action==='open')await tx.query("INSERT INTO jobs(id,kind,payload) VALUES($1,'route','{}')",[id()]);
  }else if(resource==='competitions'){
   if(!['approve','close'].includes(v.action))throw new AppError(422,'Create a new form version to change competition rules.');
   const {rows:[c]}=await tx.query('SELECT * FROM competitions WHERE id=$1 FOR UPDATE',[recordId]);if(!c)throw new AppError(404,'Competition not found.');
   if(!c.opens_at||!c.closes_at||!Number.isFinite(new Date(c.opens_at).getTime())||!Number.isFinite(new Date(c.closes_at).getTime())||new Date(c.closes_at)<=new Date(c.opens_at))throw new AppError(422,'Confirm competition opening and closing dates before approving or closing this draft.');
   competitionSchema.parse(c.config);
   await tx.query('UPDATE competitions SET status=$2 WHERE id=$1',[recordId,v.action==='approve'?'approved':'closed']);
  }else if(resource==='editions'){
   const {rows:[edition]}=await tx.query('SELECT * FROM editions WHERE id=$1 FOR UPDATE',[recordId]);if(!edition)throw new AppError(404,'Edition not found.');
   if(edition.state==='archived')throw new AppError(409,'Archived editions are read-only.');
   if(v.action==='configure'){
    const patch=z.object({label:z.string().min(2).max(100),registrationOpens:iso,registrationCloses:iso,eventDate:iso.nullable(),config:z.object({registrationApproved:z.boolean(),consentVersion:z.string(),consentText:z.string(),publicationConsentVersion:z.string().default(''),publicationConsentText:z.string().default(''),schoolVerificationApproved:z.boolean()})}).parse(v);
    if(new Date(patch.registrationCloses)<=new Date(patch.registrationOpens))throw new AppError(422,'Registration must close after it opens.');
    if(edition.state==='open')throw new AppError(409,'Close registration before changing edition configuration.');
    await audit(tx,actor,'edition.configuration','editions',recordId,{before:edition,after:patch,reason:v.reason});
    await tx.query('UPDATE editions SET label=$2,registration_opens=$3,registration_closes=$4,event_date=$5,config=$6,updated_at=now() WHERE id=$1',[recordId,patch.label,patch.registrationOpens,patch.registrationCloses,patch.eventDate,JSON.stringify(patch.config)]);
   }else if(v.action==='open'){
    if(!edition.config.registrationApproved||!edition.config.consentVersion||!edition.config.consentText||!edition.registration_opens||!edition.registration_closes||new Date(edition.registration_closes)<=new Date(edition.registration_opens))throw new AppError(422,'Approve consent and registration dates first.');
    await tx.query("UPDATE editions SET state='open' WHERE id=$1",[recordId]);
   }else if(['close','archive'].includes(v.action))await tx.query('UPDATE editions SET state=$2 WHERE id=$1',[recordId,v.action==='archive'?'archived':'closed']);
   else throw new AppError(422,'Choose configure, open, close or archive.');
  }else if(resource==='entries'){
   if(v.action!=='reopen')throw new AppError(422,'Use results to record a jury decision.');
   const {rows:[entry]}=await tx.query('SELECT s.*,e.state edition_state FROM submissions s JOIN competitions c ON c.id=s.competition_id JOIN editions e ON e.id=c.edition_id WHERE s.id=$1 AND s.trashed_at IS NULL FOR UPDATE OF s',[recordId]);if(!entry||entry.edition_state==='archived')throw new AppError(409,'Entry cannot be reopened.');
   await tx.query("UPDATE submissions SET state='draft',lock_version=lock_version+1,updated_at=now() WHERE id=$1",[recordId]);
   await tx.query('UPDATE judge_assignments SET active=false,revoked_at=now(),revocation_reason=$2,revision_invalidated=true WHERE submission_id=$1 AND ((active AND revoked_at IS NULL) OR revision_invalidated)',[recordId,v.reason]);await tx.query('UPDATE publications SET active=false WHERE submission_id=$1',[recordId]);
  }else if(resource==='reviews'){
   const {rows:[review]}=await tx.query('SELECT * FROM reviews WHERE id=$1 FOR UPDATE',[recordId]);if(!review)throw new AppError(404,'Review not found.');
   if(v.action==='reopen'){
    if(review.status!=='submitted')throw new AppError(409,'Only a final review can be reopened.');await tx.query('INSERT INTO review_history(id,review_id,snapshot,reason,actor_id) VALUES($1,$2,$3,$4,$5)',[id(),recordId,JSON.stringify(review),v.reason,actor.id]);await tx.query("UPDATE reviews SET status='draft',submitted_at=NULL,lock_version=lock_version+1 WHERE id=$1",[recordId]);
   }else if(v.action==='eligibility')await tx.query('UPDATE reviews SET eligible_for_results=$2 WHERE id=$1',[recordId,z.boolean().parse(v.eligible)]);else throw new AppError(422,'Use reopen or eligibility; administrators cannot edit scores.');
  }else if(resource==='jobs'){
   if(v.action!=='retry')throw new AppError(422,'Choose retry.');await tx.query("UPDATE jobs SET status='pending',attempts=0,run_after=now(),locked_at=NULL,last_error=NULL WHERE id=$1 AND status='failed'",[recordId]);
  }else throw new AppError(404,'Action not found.');
  await audit(tx,actor,`admin.${v.action}`,resource,recordId,{reason:v.reason});return result;
 });
}
