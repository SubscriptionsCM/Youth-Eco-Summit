import { z } from 'zod';
import type { Db } from './db';
import { AppError, audit, requireAdmin, type Actor } from './core';
import { participationWindowStatus, windowForDeadline } from '../data/participation-window';

/** Read inside the submission transaction; never cache an admission decision. */
export async function participationSettings(db:Db, lock=false) {
 const {rows:[row]}=await db.query(`SELECT deadline_date::text,managed,lock_version,updated_at,updated_by FROM participation_settings WHERE singleton=true${lock?' FOR SHARE':''}`);
 if(!row) throw new AppError(503,'The registration deadline is unavailable. Please try again.');
 const window=windowForDeadline(row.deadline_date);
 return {deadlineDate:row.deadline_date,window,managed:row.managed,lockVersion:row.lock_version,updatedAt:row.updated_by?row.updated_at:null,updatedBy:row.updated_by};
}
export async function publicParticipationWindow(db:Db) {
 const {window,managed}=await participationSettings(db);
 return {window,managed,status:participationWindowStatus(Date.now(),window)};
}
export async function adminParticipationWindow(db:Db,actor:Actor) {
 requireAdmin(actor);return participationSettings(db);
}
export async function saveParticipationWindow(db:Db,actor:Actor,input:unknown) {
 requireAdmin(actor);
 const v=z.object({deadlineDate:z.string(),lockVersion:z.number().int().nonnegative(),confirmPastDeadline:z.boolean().optional()}).strict().parse(input);
 let window;
 try{window=windowForDeadline(v.deadlineDate);}catch(error){throw new AppError(422,(error as Error).message);}
 if(Date.parse(window.closesAt)<=Date.now()&&!v.confirmPastDeadline) throw new AppError(422,'This date has already passed and will close student registration and competition submissions immediately. Confirm this before saving.');
 return db.transaction(async tx=>{
  const {rows:[row]}=await tx.query('SELECT deadline_date::text,lock_version FROM participation_settings WHERE singleton=true FOR UPDATE');
  if(!row)throw new AppError(503,'The registration deadline is unavailable.');
  if(row.lock_version!==v.lockVersion)throw new AppError(409,'Another administrator changed the deadline. Reload the current deadline before saving.');
  if(Date.parse(window.closesAt)<=Date.now()&&!v.confirmPastDeadline)throw new AppError(422,'The chosen deadline passed while this save was waiting. Confirm that you intend to close student registration and competition submissions immediately before saving again.');
  await tx.query('UPDATE participation_settings SET deadline_date=$1,managed=true,lock_version=lock_version+1,updated_by=$2,updated_at=now() WHERE singleton=true',[v.deadlineDate,actor.id]);
  await audit(tx,actor,'participation.deadline','participation_settings','current',{before:{deadlineDate:row.deadline_date},after:{deadlineDate:v.deadlineDate,closesAt:window.closesAt}});
  return participationSettings(tx);
 });
}
/** Preserve separately configured historical schedules until an admin manages the shared deadline. */
export async function effectiveParticipationClose(db:Db,configured:string|Date) {
 const current=await participationSettings(db,true);
 return current.managed?Date.parse(current.window.closesAt):new Date(configured).getTime();
}
