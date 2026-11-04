import { createHash,randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Db } from './db';
import { AppError,type Actor,id,audit } from './core';
import { entryAccess } from './access';
import { categoryFor,competitionSchema,phone } from '../domain/rules';
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export async function inviteTeam(db:Db,actor:Actor,entryId:string,input:unknown){
 const v=z.object({contact:phone}).parse(input);
 return db.transaction(async tx=>{
  await tx.query('SELECT id FROM submissions WHERE id=$1 FOR UPDATE',[entryId]);const entry=await entryAccess(tx,actor,entryId,true);
  const config=competitionSchema.parse(entry.config);if(config.mode!=='team')throw new AppError(422,'This competition uses individual entries.');
  const {rows:[count]}=await tx.query("SELECT count(*)::int count FROM team_invitations WHERE submission_id=$1 AND created_at>now()-interval '1 day'",[entryId]);if(count.count>=50)throw new AppError(429,'Too many team invitations.');
  const token=randomBytes(32).toString('hex');await tx.query("INSERT INTO team_invitations(id,token_hash,submission_id,contact,issued_by,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '48 hours')",[id(),hash(token),entryId,v.contact,actor.id]);
  await audit(tx,actor,'team.invite','submissions',entryId);return {invitePath:`/teams/join?token=${token}`,expiresInHours:48};
 });
}
export async function joinTeam(db:Db,actor:Actor,input:unknown){
 const v=z.object({token:z.string().regex(/^[a-f0-9]{64}$/),participationId:z.uuid(),consent:z.literal(true)}).parse(input);
 return db.transaction(async tx=>{
  const {rows:[invite]}=await tx.query('SELECT * FROM team_invitations WHERE token_hash=$1 AND expires_at>now() FOR UPDATE',[hash(v.token)]);
  if(!invite||invite.contact!==actor.contact||actor.role!=='participant')throw new AppError(404,'Invitation not found for this verified contact.');
  const {rows:[entry]}=await tx.query(`SELECT s.*,c.config,c.edition_id,p.school_id,p.class FROM submissions s JOIN competitions c ON c.id=s.competition_id JOIN student_participations p ON p.id=s.student_participation_id WHERE s.id=$1 AND s.state='draft' AND s.trashed_at IS NULL AND NOT s.purging FOR UPDATE OF s`,[invite.submission_id]);
  if(!entry)throw new AppError(409,'This team entry is no longer editable.');
  const {rows:[parent]}=await tx.query("SELECT 1 FROM student_participations p JOIN students st ON st.id=p.student_id JOIN schools sc ON sc.id=p.school_id JOIN editions e ON e.id=p.edition_id WHERE p.id=$1 AND p.trashed_at IS NULL AND st.trashed_at IS NULL AND sc.trashed_at IS NULL AND sc.status='active' AND e.state='open' FOR SHARE OF p,st,sc,e",[entry.student_participation_id]);
  if(!parent)throw new AppError(409,'This entry or its registration is no longer open.');
  if(invite.accepted_participation_id){if(invite.accepted_participation_id!==v.participationId)throw new AppError(409,'Invitation already used.');return {joined:true};}
  const {rows:[p]}=await tx.query(`SELECT p.* FROM student_participations p JOIN participant_access a ON a.student_id=p.student_id JOIN students st ON st.id=p.student_id JOIN schools sc ON sc.id=p.school_id WHERE p.id=$1 AND a.user_id=$2 AND p.trashed_at IS NULL AND st.trashed_at IS NULL AND sc.trashed_at IS NULL AND sc.status='active'`,[v.participationId,actor.id]);
  const config=competitionSchema.parse(entry.config);
  if(!p||p.edition_id!==entry.edition_id||(config.teamSchoolPolicy==='same_school'&&p.school_id!==entry.school_id)||(config.teamClassPolicy==='same_category'&&categoryFor(config.categories,p.class)!==entry.category_id)||config.mode!=='team'||p.id===entry.student_participation_id)throw new AppError(422,'The student is not eligible for this team.');
  categoryFor(config.categories,p.class);
  const {rows:[count]}=await tx.query('SELECT count(*)::int count FROM submission_members WHERE submission_id=$1',[entry.id]);if(count.count+1>=config.maxMembers)throw new AppError(422,'This team is full.');
  await tx.query('INSERT INTO submission_members(submission_id,participation_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[entry.id,p.id]);
  await tx.query('UPDATE team_invitations SET accepted_participation_id=$2 WHERE id=$1',[invite.id,p.id]);await tx.query('UPDATE submissions SET lock_version=lock_version+1 WHERE id=$1',[entry.id]);
  await audit(tx,actor,'team.join','submissions',entry.id,{participationId:p.id,consent:true});return {joined:true,reference:entry.reference};
 });
}
