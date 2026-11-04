import { z } from 'zod';
import type { Db } from './db';
import { AppError,type Actor,id,audit,requireAdmin } from './core';
import { entryAccess } from './access';
export async function publicationConsent(db:Db,actor:Actor,input:unknown){
 const v=z.object({studentId:z.uuid(),editionId:z.uuid(),accepted:z.boolean(),version:z.string()}).parse(input);
 return db.transaction(async tx=>{
  const {rows:[access]}=await tx.query('SELECT 1 FROM participant_access WHERE user_id=$1 AND student_id=$2',[actor.id,v.studentId]);if(!access||actor.role!=='participant')throw new AppError(403,'Guardian authorization required.');
  const {rows:[edition]}=await tx.query('SELECT config FROM editions WHERE id=$1',[v.editionId]);if(!edition?.config.publicationConsentText||edition.config.publicationConsentVersion!==v.version)throw new AppError(422,'Approved publication wording is not available.');
  await tx.query("INSERT INTO consents(id,student_id,edition_id,actor_id,purpose,wording_version,wording,accepted) VALUES($1,$2,$3,$4,'publication',$5,$6,$7)",[id(),v.studentId,v.editionId,actor.id,v.version,edition.config.publicationConsentText,v.accepted]);
  if(!v.accepted)await tx.query('UPDATE publications SET active=false WHERE submission_id IN(SELECT s.id FROM submissions s JOIN student_participations p ON p.id=s.student_participation_id WHERE p.student_id=$1 AND p.edition_id=$2 UNION SELECT m.submission_id FROM submission_members m JOIN student_participations p ON p.id=m.participation_id WHERE p.student_id=$1 AND p.edition_id=$2)',[v.studentId,v.editionId]);
  await audit(tx,actor,'consent.publication','students',v.studentId,{accepted:v.accepted,version:v.version});return {recorded:true};
 });
}
export async function publish(db:Db,actor:Actor,input:unknown){
 requireAdmin(actor);const v=z.object({entryId:z.uuid(),title:z.string().trim().min(2).max(200),summary:z.string().trim().min(1).max(5000),award:z.string().max(300).optional(),active:z.boolean(),assetIds:z.array(z.uuid()).max(50).default([]),mediaApproved:z.boolean().default(false)}).parse(input);
 if(new Set(v.assetIds).size!==v.assetIds.length)throw new AppError(422,'Select each file only once.');
 if(v.assetIds.length&&!v.mediaApproved)throw new AppError(422,'Review the selected files for public release and confirm moderation approval.');
 return db.transaction(async tx=>{
  await tx.query('SELECT id FROM submissions WHERE id=$1 FOR UPDATE',[v.entryId]);const entry=await entryAccess(tx,actor,v.entryId);
  if(entry.trashed_at||entry.state==='draft'||entry.school_trashed||entry.student_trashed)throw new AppError(409,'Only retained active submitted entries may be published.');
  const {rows:members}=await tx.query('SELECT p.student_id FROM student_participations p WHERE p.id=$1 UNION SELECT p.student_id FROM submission_members m JOIN student_participations p ON p.id=m.participation_id WHERE m.submission_id=$2',[entry.student_participation_id,entry.id]);
  for(const member of members){const {rows:[consent]}=await tx.query("SELECT accepted FROM consents WHERE student_id=$1 AND edition_id=$2 AND purpose='publication' ORDER BY created_at DESC,id DESC LIMIT 1",[member.student_id,entry.edition_id]);if(v.active&&!consent?.accepted)throw new AppError(422,'Every participant needs separate publication consent.');}
  const {rows:files}=await tx.query("SELECT a.id FROM assets a WHERE a.id=ANY($1::uuid[]) AND a.submission_id=$2 AND a.revision=$3 AND a.status='ready' AND a.trashed_at IS NULL AND EXISTS(SELECT 1 FROM submission_revisions r WHERE r.submission_id=a.submission_id AND r.version=a.revision AND r.asset_ids ? a.id::text) FOR SHARE",[v.assetIds,entry.id,entry.revision]);
  if(files.length!==v.assetIds.length)throw new AppError(422,'Only retained files from the current submitted revision may be selected.');
  const {rows:[row]}=await tx.query('INSERT INTO publications(id,submission_id,revision,title,summary,award,approved_by,active,asset_ids) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(submission_id,revision) DO UPDATE SET title=excluded.title,summary=excluded.summary,award=excluded.award,approved_by=excluded.approved_by,active=excluded.active,asset_ids=excluded.asset_ids RETURNING *',[id(),entry.id,entry.revision,v.title,v.summary,v.award??null,actor.id,v.active,JSON.stringify(v.assetIds)]);await audit(tx,actor,'publication.moderate','submissions',entry.id,{publicationId:row.id,active:v.active,assetIds:v.assetIds,mediaApproved:v.mediaApproved});return row;
 });
}
