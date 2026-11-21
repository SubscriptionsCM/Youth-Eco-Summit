import {canUseForm,canUseSchoolWorkspace,participantKind} from '../domain/participant-access';
import {AppError,type Actor} from './core';
import type {Db} from './db';

/** Permissions come from the current account, never a request or stale actor object. */
export async function currentAccessActor(db:Db,actor:Actor|null):Promise<Actor|null>{
 if(!actor)return null;
 const {rows:[user]}=await db.query('SELECT id,role,contact,participant_kind FROM users WHERE id=$1 AND active FOR SHARE',[actor.id]);
 if(!user||user.role!==actor.role||(actor.contact!==undefined&&user.contact!==actor.contact))throw new AppError(401,'Your account changed. Sign in again.');
 return {id:user.id,role:user.role,contact:user.contact,...user.role==='participant'?{participantKind:participantKind({role:'participant',participantKind:user.participant_kind})}:{}};
}
export async function requireFormAccess(db:Db,actor:Actor|null,formKey:string,submitter?:unknown):Promise<Actor|null>{
 const current=await currentAccessActor(db,actor);
 if(!canUseForm(current,formKey,submitter))throw new AppError(current?403:401,current?'This form is not available for your account type. Open your own dashboard.':'Sign in with the appropriate account to register.');
 return current;
}
export async function requireSchoolWorkspaceAccess(db:Db,actor:Actor):Promise<Actor>{
 const current=await currentAccessActor(db,actor);
 if(!current||!canUseSchoolWorkspace(current))throw new AppError(403,'A school or approved educator account is required.');
 return current;
}
