import type { Db } from './db';
import { type Actor, AppError } from './core';
export async function entryAccess(db:Db,actor:Actor,entryId:string,write=false){
  const {rows:[entry]}=await db.query(`SELECT s.*,c.config,c.edition_id,c.title competition_title,c.status competition_status,c.opens_at,c.closes_at,
    p.student_id,p.school_id,p.class,p.snapshot,p.trashed_at participation_trashed,st.trashed_at student_trashed,st.purging student_purging,sc.trashed_at school_trashed,sc.purging school_purging,sc.status school_status,e.state edition_state
    FROM submissions s JOIN competitions c ON c.id=s.competition_id JOIN editions e ON e.id=c.edition_id
    JOIN student_participations p ON p.id=s.student_participation_id JOIN students st ON st.id=p.student_id JOIN schools sc ON sc.id=p.school_id WHERE s.id=$1`,[entryId]);
  if(!entry||entry.purging)throw new AppError(404,'Entry not found.');
  const {rows:[user]}=await db.query('SELECT active,role FROM users WHERE id=$1',[actor.id]);
  if(!user?.active||user.role!==actor.role)throw new AppError(401,'Your session is no longer active.');
  const admin=['owner','admin'].includes(actor.role);
  if(!admin&&(entry.trashed_at||entry.participation_trashed||entry.student_trashed||entry.school_trashed||entry.student_purging||entry.school_purging))throw new AppError(404,'Entry not found.');
  if(actor.role==='participant'){
    const {rows}=await db.query(`SELECT 1 FROM participant_access WHERE user_id=$1 AND student_id=$2 UNION SELECT 1 FROM submission_members m JOIN student_participations p ON p.id=m.participation_id JOIN participant_access a ON a.student_id=p.student_id JOIN students st ON st.id=p.student_id JOIN schools sc ON sc.id=p.school_id WHERE m.submission_id=$3 AND a.user_id=$1 AND $4=false AND p.trashed_at IS NULL AND st.trashed_at IS NULL AND sc.trashed_at IS NULL`,[actor.id,entry.student_id,entryId,write]);
    if(!rows.length)throw new AppError(404,'Entry not found.');
  }else if(!admin){
    const {rows}=await db.query(`SELECT 1 FROM judge_assignments a JOIN review_rounds r ON r.id=a.round_id WHERE a.submission_id=$1 AND a.judge_id=$2 AND a.active AND a.revoked_at IS NULL AND r.open AND a.revision=$3`,[entryId,actor.id,entry.revision]);
    if(!rows.length||entry.state==='draft'||entry.edition_state==='archived')throw new AppError(404,'Entry not found.');
  }
  if(write&&(actor.role!=='participant'||entry.state!=='draft'||entry.edition_state==='archived'||entry.trashed_at||entry.school_status!=='active'))throw new AppError(409,'Only active participant drafts can be edited.');
  return entry;
}
export async function assetAccess(db:Db,actor:Actor,assetId:string){
  const {rows:[asset]}=await db.query('SELECT * FROM assets WHERE id=$1',[assetId]);
  if(!asset||asset.trashed_at||asset.status!=='ready')throw new AppError(404,'File is not available.');
  const entry=await entryAccess(db,actor,asset.submission_id);
  if(entry.trashed_at||entry.school_trashed||entry.student_trashed||entry.participation_trashed||entry.student_purging||entry.school_purging)throw new AppError(404,'File is in Trash. Restore its records before accessing it.');
  if(actor.role==='judge'&&asset.revision!==entry.revision)throw new AppError(404,'File not found.');
  if(!['owner','admin'].includes(actor.role)){
    if(asset.revision<=entry.revision){
      const {rows:[selected]}=await db.query('SELECT 1 FROM submission_revisions WHERE submission_id=$1 AND version=$2 AND asset_ids ? $3::text',[asset.submission_id,asset.revision,asset.id]);
      if(!selected)throw new AppError(404,'File not found.');
    }else if(actor.role!=='participant'||entry.state!=='draft'||asset.revision!==entry.revision+1)throw new AppError(404,'File not found.');
  }
  return {...asset,entry};
}
