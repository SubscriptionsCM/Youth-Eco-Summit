import { z } from 'zod';
import type { Db } from './db';
import { AppError, audit, id, type Actor } from './core';

type ProviderIdentity = {id:string;email?:string;email_confirmed_at?:string;user_metadata?:unknown};
export async function linkVerifiedSupabaseIdentity(db:Db,identity:ProviderIdentity) {
 const authId=z.uuid().parse(identity.id);
 if(!identity.email_confirmed_at||!identity.email||!z.email().safeParse(identity.email).success)throw new AppError(401,'Verify your email address before signing in.');
 const email=identity.email.trim().toLowerCase();
 return db.transaction(async tx=>{
  await tx.query('LOCK TABLE supabase_identities IN EXCLUSIVE MODE');
  const {rows:[linked]}=await tx.query('SELECT u.*,s.verified_contact,s.recovery_nonce FROM supabase_identities s JOIN users u ON u.id=s.user_id WHERE s.auth_user_id=$1',[authId]);
  if(linked){
   if(!linked.active||linked.role!=='participant')throw new AppError(403,'This participant account is unavailable.');
   if(linked.recovery_nonce)throw new AppError(403,'Password recovery is pending. Contact support to reconcile account access.');
   if(linked.verified_contact!==email||linked.contact!==email)throw new AppError(409,'Contact support to reconcile this changed email address.');
   return linked;
  }
  const {rows}=await tx.query('SELECT id FROM users WHERE lower(contact)=$1',[email]);
  if(rows.length)throw new AppError(409,'An existing account uses this email. Contact support to reconcile accounts; access has not been linked automatically.');
  const {rows:[user]}=await tx.query("INSERT INTO users(id,role,contact) VALUES($1,'participant',$2) RETURNING *",[id(),email]);
  await tx.query('INSERT INTO supabase_identities(auth_user_id,user_id,verified_contact) VALUES($1,$2,$3)',[authId,user.id,email]);
  return user;
 });
}
export function supabaseAuthConfigured(){return !!process.env.SUPABASE_URL&&!!process.env.SUPABASE_PUBLISHABLE_KEY&&process.env.AUTH_PARTICIPANT_PROVIDER==='supabase';}
async function provider(path:string,body:unknown,token?:string,method='POST') {
 if(!supabaseAuthConfigured())throw new AppError(503,'Email accounts are not configured yet.');
 const url=new URL(process.env.SUPABASE_URL!);
 if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw new AppError(503,'The authentication provider requires HTTPS.');
 try {
  const result=await fetch(new URL(`/auth/v1/${path}`,url),{method,headers:{'Content-Type':'application/json',apikey:process.env.SUPABASE_PUBLISHABLE_KEY!,...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!result.ok)throw new AppError(result.status===429?429:result.status>=500?503:400,result.status===429?'Too many attempts. Please try again later.':result.status>=500?'Email accounts are temporarily unavailable. Please try again later.':'The account details or verification code were not accepted. Check your email and password, or contact support.');
  return await result.json();
 } catch(error) {
  if(error instanceof AppError)throw error;
  throw new AppError(503,'Email accounts are temporarily unavailable. Please try again later.');
 }
}
const recoveryIdentity=z.object({id:z.uuid(),email:z.email(),email_confirmed_at:z.string().min(1)});
async function recoverParticipant(db:Db,email:string,input:Record<string,unknown>) {
 const values=z.object({code:z.string().regex(/^\d{6,10}$/),password:z.string().min(12).max(256)}).safeParse(input);
 if(!values.success)throw new AppError(400,'Enter the recovery code and a password between 12 and 256 characters.');
 const verified=await provider('verify',{email,token:values.data.code,type:'recovery'});
 const result=z.object({user:recoveryIdentity,access_token:z.string().min(1).max(16384)}).safeParse(verified);
 if(!result.success||result.data.user.email.trim().toLowerCase()!==email)throw new AppError(401,'Recovery code or account identity is invalid.');
 // Commit revocation before crossing the provider boundary. A lost provider
 // response must leave access blocked, even if its password update succeeded.
 // Never supersede an unresolved attempt: provider writes can complete out of
 // order. An uncertain outcome requires explicit operator reconciliation.
 const nonce=id();
 const user=await db.transaction(async tx=>{
  const {rows:[user]}=await tx.query<Actor & {active:boolean;verified_contact:string;recovery_nonce:string|null}>(`SELECT u.*,s.verified_contact,s.recovery_nonce FROM supabase_identities s JOIN users u ON u.id=s.user_id
   WHERE s.auth_user_id=$1 FOR UPDATE OF s,u`,[result.data.user.id]);
  if(!user||!user.active||user.role!=='participant')throw new AppError(403,'This participant account is unavailable.');
  if(user.contact!==email||user.verified_contact!==email)throw new AppError(409,'Contact support to reconcile this changed email address.');
  if(user.recovery_nonce)throw new AppError(409,'Password recovery is already pending. Contact support to reconcile account access.');
  await tx.query('UPDATE users SET auth_version=auth_version+1,updated_at=now() WHERE id=$1',[user.id]);
  await tx.query('UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1',[user.id]);
  await tx.query('UPDATE supabase_identities SET recovery_nonce=$2 WHERE auth_user_id=$1',[result.data.user.id,nonce]);
  await audit(tx,user,'auth.participant.recovery_started','user',user.id,{});
  return user;
 });
 try {
  await provider('user',{password:values.data.password},result.data.access_token,'PUT');
 } catch(error) {
  throw new AppError(error instanceof AppError?error.status:503,'The password reset could not be confirmed. Contact support to reconcile account access.');
 }
 try {
  await db.transaction(async tx=>{
   const cleared=await tx.query('UPDATE supabase_identities SET recovery_nonce=NULL WHERE auth_user_id=$1 AND user_id=$2 AND recovery_nonce=$3 RETURNING user_id',[result.data.user.id,user.id,nonce]);
   if(!cleared.rows.length)throw new AppError(409,'The recovery state changed. Contact support to reconcile account access.');
   await audit(tx,user,'auth.participant.recover','user',user.id,{});
  });
 } catch(error) {
  if(error instanceof AppError)throw error;
  throw new AppError(503,'The password reset could not be confirmed. Contact support to reconcile account access.');
 }
 return Response.json({data:{recovered:true,message:'Password reset. Sign in with your new password.'}},{headers:{'Cache-Control':'no-store'}});
}
export async function supabaseParticipantAction(db:Db,route:string,input:Record<string,unknown>,startSession:(user:any,mfa:boolean)=>Promise<Response>) {
 const email=z.email().max(254).parse(input.contact).trim().toLowerCase();
 if(route==='participant/recovery/request'){
  await provider('recover',{email});
  return Response.json({data:{sent:true,message:'If an eligible account exists, recovery instructions have been sent. Enter the recovery code from your email.'}},{headers:{'Cache-Control':'no-store'}});
 }
 if(route==='participant/recovery/complete')return recoverParticipant(db,email,input);
 if(route==='participant/signup'){
  const password=z.string().min(12).max(256).parse(input.password);
  await provider('signup',{email,password});
  return Response.json({data:{sent:true,message:'Check your email for the account confirmation code. If you already have an account, sign in.'}},{headers:{'Cache-Control':'no-store'}});
 }
 if(route==='participant/login'){
  const password=z.string().min(1).max(256).parse(input.password);
  const result=await provider('token?grant_type=password',{email,password});
  const user=await linkVerifiedSupabaseIdentity(db,result.user);
  return startSession(user,false);
 }
 if(route==='participant/verify'){
  const token=z.string().regex(/^\d{6,10}$/).parse(input.code);
  const result=await provider('verify',{email,token,type:'signup'});
  return startSession(await linkVerifiedSupabaseIdentity(db,result.user),false);
 }
 if(route==='participant/resend'){
  await provider('resend',{email,type:'signup'});
  return Response.json({data:{sent:true}},{headers:{'Cache-Control':'no-store'}});
 }
 return null;
}
