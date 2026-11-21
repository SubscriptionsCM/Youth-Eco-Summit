import {z} from 'zod';
import type {Db} from './db';
import {AppError,audit,requireAdmin,type Actor} from './core';
import {currentAccessActor} from './participant-access';

const kind=z.enum(['student','educator','school','unclassified']);
async function administrator(db:Db,actor:Actor){const current=await currentAccessActor(db,actor);if(!current)throw new AppError(401,'Sign in to continue.');requireAdmin(current);return current;}
export async function participantAccounts(db:Db,actor:Actor,params:URLSearchParams){
 await administrator(db,actor);
 const q=(params.get('q')||'').trim().slice(0,150),filter=params.get('kind')||'unclassified';
 if(filter!=='all')kind.parse(filter);
 const page=Math.max(1,Math.min(100000,Math.floor(Number(params.get('page')))||1));
 const where="role='participant' AND ($1='all' OR participant_kind=$1) AND ($2='' OR name ILIKE '%'||$2||'%' OR contact ILIKE '%'||$2||'%')";
 const {rows:items}=await db.query(`SELECT id,name,contact,participant_kind,auth_version FROM users WHERE ${where} ORDER BY created_at,id LIMIT 25 OFFSET $3`,[filter,q,(page-1)*25]);
 const {rows:[count]}=await db.query(`SELECT count(*)::int total FROM users WHERE ${where}`,[filter,q]);
 return {items,total:count.total,page,pageSize:25};
}
export async function setParticipantKind(db:Db,actor:Actor,userId:string,input:unknown){
 z.uuid().parse(userId);
 const v=z.object({participantKind:kind,expectedKind:kind,authVersion:z.number().int().min(0)}).strict().parse(input);
 return db.transaction(async tx=>{
  const current=await administrator(tx,actor);
  const {rows:[user]}=await tx.query("SELECT id,participant_kind,auth_version FROM users WHERE id=$1 AND role='participant' FOR UPDATE",[userId]);
  if(!user)throw new AppError(404,'Participant account not found.');
  if(user.participant_kind!==v.expectedKind||user.auth_version!==v.authVersion)throw new AppError(409,'This account changed. Reload before assigning its type.');
  if(user.participant_kind===v.participantKind)return user;
  const {rows:[updated]}=await tx.query('UPDATE users SET participant_kind=$2,updated_at=now() WHERE id=$1 RETURNING id,participant_kind,auth_version',[userId,v.participantKind]);
  await audit(tx,current,'account.participant_kind','user',userId,{before:user.participant_kind,after:v.participantKind});
  return updated;
 });
}
