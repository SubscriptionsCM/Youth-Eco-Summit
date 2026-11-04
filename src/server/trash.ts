import { z } from 'zod';
import type { Db } from './db';
import { AppError,type Actor,id,audit,requireAdmin } from './core';
type Item={type:string;id:string};
const target=z.object({type:z.enum(['schools','students','submissions']),id:z.uuid()});
export async function deletionPreview(db:Db,actor:Actor,input:unknown){
 requireAdmin(actor);const v=target.parse(input);
 const {rows:[root]}=await db.query(`SELECT id,trashed_at,purging FROM ${v.type} WHERE id=$1`,[v.id]);
 if(!root||root.trashed_at||root.purging)throw new AppError(404,'Active record not found.');
 const items:Item[]=[v];
 if(v.type==='schools'){
  const {rows:shared}=await db.query(`SELECT 1 FROM submission_members m JOIN student_participations member ON member.id=m.participation_id JOIN submissions s ON s.id=m.submission_id JOIN student_participations lead ON lead.id=s.student_participation_id WHERE (member.school_id=$1 OR lead.school_id=$1) AND member.school_id<>lead.school_id LIMIT 1`,[v.id]);
  if(shared.length)throw new AppError(409,'This school has cross-school team entries. Resolve those shared entries separately before deleting the school.');
 }
 if(v.type==='students'){
  const {rows:shared}=await db.query(`SELECT s.reference FROM submission_members m JOIN student_participations p ON p.id=m.participation_id JOIN submissions s ON s.id=m.submission_id WHERE p.student_id=$1`,[v.id]);
  const {rows:leads}=await db.query(`SELECT s.reference FROM submissions s JOIN student_participations p ON p.id=s.student_participation_id WHERE p.student_id=$1 AND EXISTS(SELECT 1 FROM submission_members m WHERE m.submission_id=s.id)`,[v.id]);
  if(shared.length||leads.length)throw new AppError(409,'This student belongs to shared team entries. Resolve the team records separately before deleting this student.');
 }
 if(v.type!=='submissions'){
  const column=v.type==='schools'?'school_id':'student_id';
  const {rows:ps}=await db.query(`SELECT id FROM student_participations WHERE ${column}=$1 AND trashed_at IS NULL`,[v.id]);items.push(...ps.map(p=>({type:'student_participations',id:p.id})));
  const {rows:ss}=await db.query(`SELECT s.id FROM submissions s JOIN student_participations p ON p.id=s.student_participation_id WHERE p.${column}=$1 AND s.trashed_at IS NULL`,[v.id]);items.push(...ss.map(s=>({type:'submissions',id:s.id})));
  if(v.type==='schools'){const {rows:sps}=await db.query('SELECT id FROM school_participations WHERE school_id=$1 AND trashed_at IS NULL',[v.id]);items.push(...sps.map(p=>({type:'school_participations',id:p.id})));}
 }
 const teacherRegistrations=v.type==='schools'?(await db.query('SELECT id,reference,status FROM teacher_registrations WHERE school_id=$1',[v.id])).rows:[];
 const counts=items.reduce<Record<string,number>>((a,i)=>({...a,[i.type]:(a[i.type]??0)+1}),{});
 if(teacherRegistrations.length)counts.teacher_registrations=teacherRegistrations.length;
 return {root:v,items,teacherRegistrations,dependencies:items.length-1+teacherRegistrations.length,counts};
}
export async function trash(db:Db,actor:Actor,input:unknown){
 requireAdmin(actor);const v=target.extend({reason:z.string().trim().min(3).max(2000),includeDependencies:z.boolean().default(false)}).parse(input);
 return db.transaction(async tx=>{
  await tx.query(`SELECT id FROM ${v.type} WHERE id=$1 FOR UPDATE`,[v.id]);const preview=await deletionPreview(tx,actor,v);
  if(preview.dependencies&&!v.includeDependencies)throw new AppError(409,`This record has ${preview.dependencies} active dependencies. Review the deletion preview and explicitly include them.`);
  const batchId=id();
  await tx.query('INSERT INTO deletion_batches(id,actor_id,reason,root_type,root_id,items) VALUES($1,$2,$3,$4,$5,$6)',[batchId,actor.id,v.reason,v.type,v.id,JSON.stringify(preview.items)]);
  for(const item of preview.items){await tx.query(`UPDATE ${item.type} SET trashed_at=now(),deletion_batch_id=$2 WHERE id=$1 AND trashed_at IS NULL`,[item.id,batchId]);if(item.type==='submissions')await tx.query('UPDATE publications SET active=false WHERE submission_id=$1',[item.id]);}
  await audit(tx,actor,'trash.move',v.type,v.id,{batchId,reason:v.reason,items:preview.items,teacherRegistrations:preview.teacherRegistrations});return {id:batchId,...preview};
 });
}
export async function restore(db:Db,actor:Actor,batchId:string){
 requireAdmin(actor);
 return db.transaction(async tx=>{
  const {rows:[batch]}=await tx.query("SELECT * FROM deletion_batches WHERE id=$1 AND status='trashed' FOR UPDATE",[batchId]);if(!batch)throw new AppError(409,'This deletion cannot be restored.');
  const order=['schools','students','school_participations','student_participations','submissions'];
  for(const item of (batch.items as Item[]).sort((a,b)=>order.indexOf(a.type)-order.indexOf(b.type))){
   if(item.type==='student_participations'){const {rows:[p]}=await tx.query('SELECT s.trashed_at student_trashed,sc.trashed_at school_trashed FROM student_participations p JOIN students s ON s.id=p.student_id JOIN schools sc ON sc.id=p.school_id WHERE p.id=$1',[item.id]);if(p?.student_trashed||p?.school_trashed)throw new AppError(409,'Restore the parent school and student first.');}
   if(item.type==='school_participations'){const {rows:[p]}=await tx.query('SELECT s.trashed_at FROM school_participations p JOIN schools s ON s.id=p.school_id WHERE p.id=$1',[item.id]);if(p?.trashed_at)throw new AppError(409,'Restore the parent school first.');}
   if(item.type==='submissions'){const {rows:[p]}=await tx.query('SELECT p.trashed_at,st.trashed_at student_trashed,sc.trashed_at school_trashed FROM submissions s JOIN student_participations p ON p.id=s.student_participation_id JOIN students st ON st.id=p.student_id JOIN schools sc ON sc.id=p.school_id WHERE s.id=$1',[item.id]);if(p?.trashed_at||p?.student_trashed||p?.school_trashed)throw new AppError(409,'Restore parent records first.');}
   await tx.query(`UPDATE ${item.type} SET trashed_at=NULL,deletion_batch_id=NULL WHERE id=$1 AND deletion_batch_id=$2`,[item.id,batchId]);
  }
  for(const item of batch.items as Item[])if(item.type==='submissions')await tx.query(`INSERT INTO jobs(id,kind,payload) SELECT gen_random_uuid(),CASE WHEN EXISTS(SELECT 1 FROM historical_file_refs h WHERE h.asset_id=a.id) THEN 'verify_historical_asset' ELSE 'verify_asset' END,jsonb_build_object('assetId',a.id) FROM assets a WHERE a.submission_id=$1 AND a.status IN ('processing','failed') AND a.trashed_at IS NULL AND NOT EXISTS(SELECT 1 FROM jobs j WHERE j.kind IN ('verify_asset','verify_historical_asset') AND j.payload->>'assetId'=a.id::text AND j.status IN ('pending','running'))`,[item.id]);
  await tx.query("UPDATE deletion_batches SET status='restored',restored_at=now() WHERE id=$1",[batchId]);
  await audit(tx,actor,'trash.restore',batch.root_type,batch.root_id,{batchId});return {restored:true};
 });
}
export async function requestPurge(db:Db,actor:Actor,batchId:string,confirmation:string){
 if(actor.role!=='owner')throw new AppError(403,'Only the owner may permanently purge records.');
 if(confirmation!==batchId)throw new AppError(422,'Enter the deletion batch ID to confirm permanent deletion.');
 return db.transaction(async tx=>{
  const {rows:[batch]}=await tx.query("SELECT * FROM deletion_batches WHERE id=$1 AND status='trashed' FOR UPDATE",[batchId]);if(!batch)throw new AppError(409,'Only records in Trash may be purged.');
  for(const item of batch.items as Item[])if(['schools','students','submissions'].includes(item.type))await tx.query(`UPDATE ${item.type} SET purging=true WHERE id=$1 AND deletion_batch_id=$2`,[item.id,batchId]);
  await tx.query("UPDATE deletion_batches SET status='purging' WHERE id=$1",[batchId]);const jobId=id();
  await tx.query("INSERT INTO jobs(id,kind,payload) VALUES($1,'purge',$2)",[jobId,JSON.stringify({batchId,actorId:actor.id})]);await audit(tx,actor,'purge.request',batch.root_type,batch.root_id,{batchId,jobId});return {jobId,status:'purging'};
 });
}
export async function executePurge(db:Db,batchId:string,deleteObjects:(keys:string[])=>Promise<void>){
 const {rows:[batch]}=await db.query("SELECT * FROM deletion_batches WHERE id=$1 AND status IN ('purging','purge_failed')",[batchId]);if(!batch)return;
 const items=batch.items as Item[];const entries=items.filter(i=>i.type==='submissions').map(i=>i.id);
 const {rows:assets}=await db.query('SELECT id,storage_key FROM assets WHERE submission_id=ANY($1::uuid[])',[entries]);
 try{
  // Validate restrictive dependencies before deleting any bytes. Older unrelated
  // Trash batches must be purged separately, not silently swept into this batch.
  for(const item of items){
   if(item.type==='schools'||item.type==='students'){
    const column=item.type==='schools'?'school_id':'student_id';
    const {rows:[remaining]}=await db.query(`SELECT count(*)::int count FROM student_participations WHERE ${column}=$1 AND (deletion_batch_id IS NULL OR deletion_batch_id<>$2)`,[item.id,batchId]);
    if(remaining.count)throw new AppError(409,'Purge the other dependent participation batches first.');
    if(item.type==='schools'){
     const {rows:[annual]}=await db.query('SELECT count(*)::int count FROM school_participations WHERE school_id=$1 AND (deletion_batch_id IS NULL OR deletion_batch_id<>$2)',[item.id,batchId]);
     if(annual.count)throw new AppError(409,'Purge the other annual school participation batches first.');
    }
   }
   if(item.type==='student_participations'){
    const {rows:[remaining]}=await db.query('SELECT count(*)::int count FROM submissions WHERE student_participation_id=$1 AND (deletion_batch_id IS NULL OR deletion_batch_id<>$2)',[item.id,batchId]);
    if(remaining.count)throw new AppError(409,'Purge the other dependent entry batches first.');
    const {rows:[shared]}=await db.query('SELECT count(*)::int count FROM submission_members WHERE participation_id=$1 AND NOT(submission_id=ANY($2::uuid[]))',[item.id,entries]);
    if(shared.count)throw new AppError(409,'Resolve shared team entries before purging a participation.');
   }
  }
  // No live metadata is removed until the object provider confirms removal of every live version.
  await deleteObjects(assets.map(a=>a.storage_key));
  await db.transaction(async tx=>{
   for(const asset of assets)await tx.query("UPDATE audit_events SET detail='{}' WHERE entity_type IN ('asset','assets') AND entity_id=$1",[asset.id]);
   for(const entryId of entries){
    await tx.query('DELETE FROM review_history WHERE review_id IN(SELECT r.id FROM reviews r JOIN judge_assignments a ON a.id=r.assignment_id WHERE a.submission_id=$1)',[entryId]);
    await tx.query('DELETE FROM reviews WHERE assignment_id IN(SELECT id FROM judge_assignments WHERE submission_id=$1)',[entryId]);
    await tx.query('DELETE FROM judge_assignments WHERE submission_id=$1',[entryId]);
    for(const table of ['decisions','publications','team_invitations','submission_members','submission_revisions','historical_file_refs','assets'])await tx.query(`DELETE FROM ${table} WHERE submission_id=$1`,[entryId]);
    await tx.query('DELETE FROM submissions WHERE id=$1',[entryId]);
   }
   for(const item of items.filter(i=>i.type==='student_participations'||i.type==='school_participations')){if(item.type==='student_participations')await tx.query('DELETE FROM team_invitations WHERE accepted_participation_id=$1',[item.id]);await tx.query(`DELETE FROM ${item.type} WHERE id=$1 AND deletion_batch_id=$2`,[item.id,batchId]);}
   for(const item of items.filter(i=>i.type==='students')){await tx.query('DELETE FROM consents WHERE student_id=$1',[item.id]);await tx.query('DELETE FROM participant_access WHERE student_id=$1',[item.id]);await tx.query('DELETE FROM students WHERE id=$1',[item.id]);}
   for(const item of items.filter(i=>i.type==='schools')){await tx.query('DELETE FROM school_contacts WHERE school_id=$1',[item.id]);await tx.query('UPDATE school_nominations SET matched_school_id=NULL WHERE matched_school_id=$1',[item.id]);await tx.query('DELETE FROM schools WHERE id=$1',[item.id]);}
   for(const item of items){
    await tx.query("UPDATE audit_events SET detail='{}' WHERE entity_type=$1 AND entity_id=$2",[item.type,item.id]);
    await tx.query("UPDATE import_rows SET payload='{}',status='purged',error=NULL WHERE entity_id=$1",[item.id]);
    await tx.query('INSERT INTO purge_ledger(id,entity_type,entity_id,storage_keys) VALUES($1,$2,$3,$4)',[id(),item.type,item.id,JSON.stringify(item.type==='submissions'?assets.map(a=>a.storage_key):[])]);
   }
   await tx.query("UPDATE deletion_batches SET status='purged',reason='Permanently removed',items='[]' WHERE id=$1",[batchId]);
  });
 }catch(error){await db.query("UPDATE deletion_batches SET status='purge_failed' WHERE id=$1",[batchId]);throw error;}
}
