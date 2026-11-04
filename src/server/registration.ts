import { z } from 'zod';
import type { Db } from './db';
import { AppError,type Actor,id,audit } from './core';
import { schoolSchema,phone } from '../domain/rules';
export async function createSchool(db:Db,actor:Actor,input:unknown){
  if(actor.role!=='participant')throw new AppError(403,'Use a verified school contact session.');
  const v=schoolSchema.parse(input);
  if(actor.contact!==v.phone)throw new AppError(403,'Verify the school contact phone before registering.');
  return db.transaction(async tx=>{
    const {rows:duplicates}=await tx.query("SELECT id,reference FROM schools WHERE lower(name)=lower($1) AND lower(city)=lower($2) AND postal_code=$3 AND lower(address)=lower($4) AND lower(state)=lower($5) AND trashed_at IS NULL",[v.name,v.city,v.postalCode,v.address,v.state]);
    if(duplicates.length)throw new AppError(409,'A matching school already exists. Use school search or contact support to reconcile it.');
    const schoolId=id();const reference=`SCH-${id().slice(0,12).toUpperCase()}`;
    const {rows:[school]}=await tx.query('INSERT INTO schools(id,reference,name,address,city,state,postal_code,coordinator) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[schoolId,reference,v.name,v.address,v.city,v.state,v.postalCode,v.coordinator??'']);
    await tx.query('INSERT INTO school_contacts(id,school_id,user_id,name,role,email,phone) VALUES($1,$2,$3,$4,$5,$6,$7)',[id(),schoolId,actor.id,v.contactName,v.contactRole,v.email,v.phone]);
    await audit(tx,actor,'school.registration','schools',schoolId,{status:'pending'});return school;
  });
}
export async function claimSchool(db:Db,actor:Actor,reference:string){
 if(actor.role!=='participant'||!actor.contact)throw new AppError(403,'Verify the registered school contact phone first.');
 return db.transaction(async tx=>{
  const {rows:[school]}=await tx.query("SELECT * FROM schools WHERE (id::text=lower($1) OR id IN (SELECT school_id FROM school_identifiers WHERE reference=upper(trim($1)))) AND status='active' AND trashed_at IS NULL AND NOT purging FOR SHARE",[reference]);
  if(!school)throw new AppError(404,'Active registered school not found.');
  const {rows:[user]}=await tx.query("SELECT id FROM users WHERE id=$1 AND contact=$2 AND role='participant' AND active FOR SHARE",[actor.id,actor.contact]);if(!user)throw new AppError(403,'Verify the registered contact phone.');
  const {rows}=await tx.query('UPDATE school_contacts SET user_id=$2,verified_at=now() WHERE school_id=$1 AND phone=$3 RETURNING id',[school.id,actor.id,actor.contact]);
  if(!rows.length)throw new AppError(403,'The verified phone does not match this school contact. Ask support to verify a contact correction.');
  await audit(tx,actor,'school.contact.claim','schools',school.id);return {id:school.id,reference:school.reference};
 });
}
export async function updateSchool(db:Db,actor:Actor,schoolId:string,input:unknown){
  const v=schoolSchema.parse(input);
  return db.transaction(async tx=>{
    const {rows:[school]}=await tx.query('SELECT * FROM schools WHERE id=$1 AND trashed_at IS NULL AND NOT purging FOR UPDATE',[schoolId]);
    if(!school)throw new AppError(404,'School not found.');
    const administrator=['owner','admin'].includes(actor.role);
    if(!administrator&&(actor.role!=='participant'||!actor.contact))throw new AppError(403,'A verified school contact or administrator is required.');
    // Participant edits belong to their own verified contact, never the school's
    // oldest contact (which can be a different teacher or the principal).
    const {rows:[contact]}=await tx.query(administrator
      ? 'SELECT * FROM school_contacts WHERE school_id=$1 ORDER BY created_at,id LIMIT 1 FOR UPDATE'
      : "SELECT c.* FROM school_contacts c JOIN users u ON u.id=c.user_id WHERE c.school_id=$1 AND c.user_id=$2 AND c.phone=$3 AND c.verified_at IS NOT NULL AND u.contact=$3 AND u.active AND u.role='participant' ORDER BY c.created_at,c.id LIMIT 1 FOR UPDATE OF c",
    administrator?[schoolId]:[schoolId,actor.id,actor.contact]);
    if(!administrator){
      if(!contact)throw new AppError(403,'A verified school contact or administrator is required.');
      if(v.phone!==actor.contact)throw new AppError(422,'Contact support to verify a replacement contact.');
    }
    await audit(tx,actor,'school.correction','schools',schoolId,{before:school,after:v});
    const {rows:[updated]}=await tx.query('UPDATE schools SET name=$2,address=$3,city=$4,state=$5,postal_code=$6,coordinator=$7,updated_at=now() WHERE id=$1 RETURNING *',[schoolId,v.name,v.address,v.city,v.state,v.postalCode,v.coordinator??school.coordinator]);
    if(contact){await audit(tx,actor,'school.contact.correction','schools',schoolId,{before:contact,after:{name:v.contactName,role:v.contactRole,email:v.email,phone:v.phone}});await tx.query('UPDATE school_contacts SET name=$2,role=$3,email=$4,phone=$5,user_id=CASE WHEN phone=$5 THEN user_id ELSE NULL END,verified_at=CASE WHEN phone=$5 THEN verified_at ELSE NULL END WHERE id=$1',[contact.id,v.contactName,v.contactRole,v.email,v.phone]);}
    return updated;
  });
}
const studentSchema=z.object({name:z.string().trim().min(2).max(150),schoolId:z.uuid(),editionId:z.uuid(),class:z.number().int().min(1).max(12),section:z.string().max(30).default(''),coordinator:z.string().max(150).default(''),guardianContact:phone,emergencyContact:phone.optional(),consent:z.literal(true),consentVersion:z.string().min(1),studentId:z.uuid().optional()});
export async function createStudent(db:Db,actor:Actor,input:unknown){
  if(actor.role!=='participant'||!actor.contact)throw new AppError(403,'Verify the guardian contact first.');
  const v=studentSchema.parse(input);if(v.guardianContact!==actor.contact)throw new AppError(422,'The guardian contact must be verified in this session.');
  return db.transaction(async tx=>{
    const {rows:[edition]}=await tx.query('SELECT * FROM editions WHERE id=$1 FOR SHARE',[v.editionId]);
    const now=Date.now();
    if(!edition||edition.state!=='open'||!edition.config.registrationApproved||!edition.config.consentText||edition.config.consentVersion!==v.consentVersion||!edition.registration_opens||!edition.registration_closes||now<new Date(edition.registration_opens).getTime()||now>=new Date(edition.registration_closes).getTime())throw new AppError(409,'Registration is closed or approved consent is unavailable.');
    const {rows:[school]}=await tx.query("SELECT * FROM schools WHERE id=$1 AND status='active' AND trashed_at IS NULL AND NOT purging FOR SHARE",[v.schoolId]);
    if(!school)throw new AppError(422,'Select a registered, active school. Nomination alone is not registration.');
    let student;
    if(v.studentId){const {rows:[existing]}=await tx.query('SELECT s.* FROM students s JOIN participant_access a ON a.student_id=s.id WHERE s.id=$1 AND a.user_id=$2 AND s.trashed_at IS NULL AND NOT s.purging FOR UPDATE OF s',[v.studentId,actor.id]);if(!existing)throw new AppError(404,'Student not found.');student=existing;}
    else { const {rows:[created]}=await tx.query('INSERT INTO students(id,reference,name,guardian_contact,emergency_contact) VALUES($1,$2,$3,$4,$5) RETURNING *',[id(),`STU-${id().slice(0,12).toUpperCase()}`,v.name,v.guardianContact,v.emergencyContact??null]);student=created;await tx.query('INSERT INTO participant_access(user_id,student_id) VALUES($1,$2)',[actor.id,student.id]);}
    const schoolSnapshot={id:school.id,reference:school.reference,name:school.name,city:school.city,state:school.state,coordinator:school.coordinator};
    await tx.query('INSERT INTO school_participations(id,school_id,edition_id,snapshot) VALUES($1,$2,$3,$4) ON CONFLICT(school_id,edition_id) DO NOTHING',[id(),school.id,edition.id,JSON.stringify(schoolSnapshot)]);
    const snapshot={studentName:v.name,school:schoolSnapshot,class:v.class,section:v.section,coordinator:v.coordinator};
    const {rows:[participation]}=await tx.query('INSERT INTO student_participations(id,student_id,school_id,edition_id,class,section,coordinator,snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(student_id,edition_id) DO NOTHING RETURNING *',[id(),student.id,school.id,edition.id,v.class,v.section,v.coordinator,JSON.stringify(snapshot)]);
    if(!participation)throw new AppError(409,'This student is already registered for this edition.');
    await tx.query("INSERT INTO consents(id,student_id,edition_id,actor_id,purpose,wording_version,wording,accepted) VALUES($1,$2,$3,$4,'participation',$5,$6,true)",[id(),student.id,edition.id,actor.id,v.consentVersion,edition.config.consentText]);
    await audit(tx,actor,'student.register','students',student.id,{participationId:participation.id});return {student,participation};
  });
}
export async function participantDashboard(db:Db,actor:Actor){
  if(actor.role!=='participant')throw new AppError(403,'Participant access required.');
  const {rows:students}=await db.query(`SELECT s.id,s.reference,s.name,COALESCE((SELECT jsonb_agg(p ORDER BY p.created_at DESC) FROM student_participations p JOIN schools sc ON sc.id=p.school_id WHERE p.student_id=s.id AND p.trashed_at IS NULL AND sc.trashed_at IS NULL),'[]') participations FROM students s JOIN participant_access a ON a.student_id=s.id WHERE a.user_id=$1 AND s.trashed_at IS NULL AND NOT s.purging ORDER BY s.created_at DESC`,[actor.id]);
  const {rows:entries}=await db.query(`SELECT s.id,s.reference,s.state,s.revision,c.title,st.name student_name FROM submissions s JOIN competitions c ON c.id=s.competition_id JOIN student_participations p ON p.id=s.student_participation_id JOIN students st ON st.id=p.student_id JOIN schools sc ON sc.id=p.school_id WHERE (EXISTS(SELECT 1 FROM participant_access a WHERE a.student_id=st.id AND a.user_id=$1) OR EXISTS(SELECT 1 FROM submission_members m JOIN student_participations mp ON mp.id=m.participation_id JOIN participant_access a ON a.student_id=mp.student_id WHERE m.submission_id=s.id AND a.user_id=$1 AND mp.trashed_at IS NULL)) AND s.trashed_at IS NULL AND NOT s.purging AND p.trashed_at IS NULL AND st.trashed_at IS NULL AND sc.trashed_at IS NULL ORDER BY s.created_at DESC LIMIT 200`,[actor.id]);
  const {rows:schools}=await db.query('SELECT DISTINCT ON(s.id) s.*,s.postal_code "postalCode",c.name "contactName",c.role "contactRole",c.email,c.phone,c.verified_at FROM schools s JOIN school_contacts c ON c.school_id=s.id WHERE c.user_id=$1 AND s.trashed_at IS NULL ORDER BY s.id,c.created_at,c.id',[actor.id]);const {rows:teachers}=await db.query('SELECT t.id,t.reference,t.name,t.status,s.name school_name FROM teacher_registrations t JOIN schools s ON s.id=t.school_id WHERE t.user_id=$1 AND s.trashed_at IS NULL ORDER BY t.created_at DESC',[actor.id]);return {students,entries,schools,teachers};
}


/** Directory fields are school identity/location only, never contacts or students. */
export async function publicSchools(db:Db,params:URLSearchParams){
 const q=(params.get('q')??'').trim().slice(0,150),city=(params.get('city')??'').trim().slice(0,100);
 const page=Math.max(1,Math.min(100000,Math.floor(Number(params.get('page'))||1)));
 const where="s.status='active' AND s.trashed_at IS NULL AND NOT s.purging AND (s.name ILIKE '%'||$1||'%' OR EXISTS(SELECT 1 FROM school_identifiers i WHERE i.school_id=s.id AND i.reference ILIKE '%'||$1||'%')) AND (s.city ILIKE '%'||$2||'%' OR s.state ILIKE '%'||$2||'%')";
 const {rows:items}=await db.query(`SELECT s.id,s.reference,s.name,s.address,s.city,s.state,s.postal_code,
 COALESCE((SELECT jsonb_agg(i.reference ORDER BY i.reference) FROM school_identifiers i WHERE i.school_id=s.id AND i.reference<>upper(s.reference)),'[]') alternate_references
 FROM schools s WHERE ${where} ORDER BY s.name,s.city,s.address,s.id LIMIT 25 OFFSET $3`,[q,city,(page-1)*25]);
 const {rows:[count]}=await db.query(`SELECT count(*)::int total FROM schools s WHERE ${where}`,[q,city]);
 return {items,total:count.total,page,pageSize:25};
}

/** School contacts see participation progress, never guardian contacts, answers or files. */
export async function schoolDashboard(db:Db,actor:Actor,schoolId:string,params:URLSearchParams){
 if(actor.role!=='participant'||!actor.contact)throw new AppError(403,'A verified school contact is required.');
 if(!z.uuid().safeParse(schoolId).success)throw new AppError(404,'School not found.');
 const {rows:[school]}=await db.query(`SELECT s.id,s.reference,s.name,s.city,s.state,s.status FROM schools s
 WHERE s.id=$1 AND s.status='active' AND s.trashed_at IS NULL AND NOT s.purging
 AND EXISTS(SELECT 1 FROM school_contacts c JOIN users u ON u.id=c.user_id WHERE c.school_id=s.id AND c.user_id=$2 AND c.phone=$3 AND u.contact=$3 AND u.active AND u.role='participant' AND c.verified_at IS NOT NULL)`,[schoolId,actor.id,actor.contact]);
 if(!school)throw new AppError(403,'Verify access through the registered school contact before viewing school registrations.');
 const editionId=params.get('editionId')??'';
 if(editionId&&!z.uuid().safeParse(editionId).success)throw new AppError(422,'Choose a valid edition.');
 const page=Math.max(1,Math.min(100000,Math.floor(Number(params.get('page'))||1)));
 const conditions="p.school_id=$1 AND ($2='' OR p.edition_id::text=$2) AND p.trashed_at IS NULL AND st.trashed_at IS NULL AND NOT st.purging";
 const {rows:[counts]}=await db.query(`SELECT count(*)::int registrations,count(DISTINCT st.id)::int students FROM student_participations p JOIN students st ON st.id=p.student_id WHERE ${conditions}`,[schoolId,editionId]);
 const {rows:[entryCounts]}=await db.query(`SELECT count(DISTINCT s.id)::int submissions FROM submissions s
 JOIN student_participations lead ON lead.id=s.student_participation_id JOIN students lead_student ON lead_student.id=lead.student_id JOIN schools lead_school ON lead_school.id=lead.school_id
 WHERE s.trashed_at IS NULL AND NOT s.purging AND lead.trashed_at IS NULL AND lead_student.trashed_at IS NULL AND NOT lead_student.purging AND lead_school.trashed_at IS NULL AND NOT lead_school.purging AND s.state<>'draft' AND EXISTS(
 SELECT 1 FROM student_participations p JOIN students st ON st.id=p.student_id WHERE ${conditions}
 AND (p.id=s.student_participation_id OR EXISTS(SELECT 1 FROM submission_members m WHERE m.submission_id=s.id AND m.participation_id=p.id)))`,[schoolId,editionId]);
 const {rows:items}=await db.query(`SELECT p.id,p.edition_id,e.label edition_label,p.class,p.section,p.created_at,st.reference student_reference,st.name student_name,
 COALESCE((SELECT jsonb_agg(entry ORDER BY entry.created_at DESC) FROM (
 SELECT s.reference,c.title,s.state,s.submitted_at,s.created_at FROM submissions s JOIN competitions c ON c.id=s.competition_id
 JOIN student_participations lead ON lead.id=s.student_participation_id JOIN students lead_student ON lead_student.id=lead.student_id JOIN schools lead_school ON lead_school.id=lead.school_id
 WHERE s.trashed_at IS NULL AND NOT s.purging AND lead.trashed_at IS NULL AND lead_student.trashed_at IS NULL AND NOT lead_student.purging AND lead_school.trashed_at IS NULL AND NOT lead_school.purging
 AND (s.student_participation_id=p.id OR EXISTS(SELECT 1 FROM submission_members m WHERE m.submission_id=s.id AND m.participation_id=p.id))
 ) entry),'[]') entries FROM student_participations p JOIN students st ON st.id=p.student_id JOIN editions e ON e.id=p.edition_id
 WHERE ${conditions} ORDER BY p.created_at DESC,p.id LIMIT 25 OFFSET $3`,[schoolId,editionId,(page-1)*25]);
 const {rows:editions}=await db.query(`SELECT DISTINCT e.id,e.label FROM editions e JOIN student_participations p ON p.edition_id=e.id JOIN students st ON st.id=p.student_id WHERE p.school_id=$1 AND p.trashed_at IS NULL AND st.trashed_at IS NULL AND NOT st.purging ORDER BY e.label DESC`,[schoolId]);
 return {school,counts:{...counts,...entryCounts},editions,items,total:counts.registrations,page,pageSize:25};
}
