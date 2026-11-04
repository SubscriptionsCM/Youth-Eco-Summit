import { z } from 'zod';
import type { Db } from './db';
import { AppError, id } from './core';

type ProviderIdentity = {id:string;email?:string;email_confirmed_at?:string;user_metadata?:unknown};
export async function linkVerifiedSupabaseIdentity(db:Db,identity:ProviderIdentity) {
 const authId=z.uuid().parse(identity.id);
 if(!identity.email_confirmed_at||!identity.email||!z.email().safeParse(identity.email).success)throw new AppError(401,'Verify your email address before signing in.');
 const email=identity.email.trim().toLowerCase();
 return db.transaction(async tx=>{
  await tx.query('LOCK TABLE supabase_identities IN EXCLUSIVE MODE');
  const {rows:[linked]}=await tx.query('SELECT u.*,s.verified_contact FROM supabase_identities s JOIN users u ON u.id=s.user_id WHERE s.auth_user_id=$1',[authId]);
  if(linked){
   if(!linked.active||linked.role!=='participant')throw new AppError(403,'This participant account is unavailable.');
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
async function provider(path:string,body:unknown,token?:string) {
 if(!supabaseAuthConfigured())throw new AppError(503,'Email accounts are not configured yet.');
 const url=new URL(process.env.SUPABASE_URL!);
 if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw new AppError(503,'The authentication provider requires HTTPS.');
 const result=await fetch(new URL(`/auth/v1/${path}`,url),{method:'POST',headers:{'Content-Type':'application/json',apikey:process.env.SUPABASE_PUBLISHABLE_KEY!,...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!result.ok)throw new AppError(result.status===429?429:400,result.status===429?'Too many attempts. Please try again later.':'The account details or verification code were not accepted. Check your email and password, or contact support.');
 return result.json();
}
export async function supabaseParticipantAction(db:Db,route:string,input:Record<string,unknown>,startSession:(user:any,mfa:boolean)=>Promise<Response>) {
 const email=z.email().max(254).parse(input.contact).trim().toLowerCase();
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
