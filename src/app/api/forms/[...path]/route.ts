import { z } from 'zod';
import { db } from '@/server/db';
import { getActor, assertSameOrigin } from '@/server/auth';
import { AppError, ok } from '@/server/core';
import { supabaseAuthConfigured } from '@/server/supabase-auth';
import { wordPressAuthConfigured } from '@/server/wordpress-auth';
import { createFormRecord, getFormRecord, saveFormRecord, submitFormRecord, FormValidationError } from '@/server/portal-forms';
import { portalUploadAction } from '@/server/portal-uploads';
import { historicalEntries, historicalEntry, linkWordPressUser } from '@/server/wordpress-projection';
import { objectStore } from '@/server/storage/provider';
import { historicalDownloadUrl } from '@/server/storage/downloads';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function route(request:Request,context:{params:Promise<{path:string[]}>}) {
 try {
  const {path}=await context.params;
  if(path[0]==='config'&&request.method==='GET'){
   const wordpress=process.env.AUTH_PARTICIPANT_PROVIDER==='wordpress';
   return ok({enabled:process.env.PORTAL_REFERENCE_FORMS==='true',configured:!!process.env.DATABASE_URL,emailAccounts:wordpress?wordPressAuthConfigured():supabaseAuthConfigured(),accountProvider:wordpress?'wordpress':'supabase'});
  }
  if(process.env.PORTAL_REFERENCE_FORMS!=='true'||!process.env.DATABASE_URL)throw new AppError(503,'Registration services are being configured. Please use the current live website.');
  assertSameOrigin(request);
  const actor=await getActor(request),token=request.headers.get('X-Draft-Key')||undefined;
  if(path[0]==='history'){
   if(!actor)throw new AppError(401,'Sign in to see historical entries.');
   if(request.method==='GET'&&path.length===1)return ok(await historicalEntries(db,actor));
   if(request.method==='GET'&&path.length===2)return ok(await historicalEntry(db,actor,path[1]));
   if(request.method==='POST'&&path.length===4&&path[1]==='files'&&path[3]==='download'){
    return ok({url:await historicalDownloadUrl(db,objectStore(),actor,path[2])});
   }
  }
  if(path.join('/')==='migration/link'&&request.method==='POST'){
   if(!actor)throw new AppError(401,'Sign in to continue.');
   const raw=await request.text();if(Buffer.byteLength(raw)>2000)throw new AppError(413,'The link request is too large.');
   let input;try{input=JSON.parse(raw);}catch{throw new AppError(400,'Send valid JSON.');}
   const data=z.object({source:z.url(),sourceId:z.string().min(1).max(250),authUserId:z.uuid()}).strict().parse(input);
   return ok(await linkWordPressUser(db,actor,data));
  }
  if(path[0]==='files')return await portalUploadAction(request,path.slice(1),actor,token);
  if(path[0]==='records'){
   if(path.length===1&&request.method==='GET'){
    if(!actor)throw new AppError(401,'Sign in to see saved forms.');
    return ok({items:(await db.query('SELECT id,form_key,reference,status,submitter_role,submitted_at,updated_at FROM portal_form_records WHERE owner_id=$1 ORDER BY updated_at DESC LIMIT 200',[actor.id])).rows});
   }
   const text=await request.text();if(Buffer.byteLength(text)>150000)throw new AppError(413,'This form is too large.');
   let input;try{input=text?JSON.parse(text):{};}catch{throw new AppError(400,'Send valid JSON.');}
   if(path.length===1&&request.method==='POST')return ok(await createFormRecord(db,actor,input),201);
   if(path.length===2&&request.method==='GET')return ok(await getFormRecord(db,actor,path[1],token));
   if(path.length===2&&request.method==='PUT')return ok(await saveFormRecord(db,actor,path[1],input,token));
   if(path.length===3&&path[2]==='submit'&&request.method==='POST')return ok(await submitFormRecord(db,actor,path[1],input,token));
  }
  throw new AppError(404,'Form action not found.');
 } catch(error) {
  if(error instanceof FormValidationError)return Response.json({error:error.message,fields:error.fields},{status:422,headers:{'Cache-Control':'no-store'}});
  if(error instanceof z.ZodError)return Response.json({error:'Check your form details.'},{status:422,headers:{'Cache-Control':'no-store'}});
  if(error instanceof AppError)return Response.json({error:error.message},{status:error.status,headers:{'Cache-Control':'no-store'}});
  if((error as {code?:string}).code==='23505')return Response.json({error:'This record already exists. Reload or use the school directory.'},{status:409,headers:{'Cache-Control':'no-store'}});
  return Response.json({error:'The form could not be saved. Please retry.'},{status:503,headers:{'Cache-Control':'no-store'}});
 }
}
export {route as GET,route as POST,route as PUT};
