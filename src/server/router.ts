import { z } from 'zod';
import { db } from './db';
import { AppError,id,ok } from './core';
import { getActor,authAction,assertSameOrigin } from './auth';
import { storageAction } from './storage';
import { createSchool,updateSchool,createStudent,participantDashboard,claimSchool,schoolDashboard,publicSchools } from './registration';
import { createEntry,updateEntry,submitEntry,entryDetail } from './entries';
import { judgeQueue,assignmentDetail,saveReview,recordDecision } from './judging';
import { adminList,adminCreate,adminPatch } from './admin';
import { deletionPreview,trash,restore,requestPurge } from './trash';
import { exportData } from './exports';
import { publicationConsent,publish } from './publication';
import { publicMedia,showcaseList } from './public-media';
import { importPreview,commitImport } from './imports';
import { inviteTeam,joinTeam } from './teams';
import { createPartnerEnquiry } from './partner-enquiries';
import { listRegistrationDrafts,saveRegistrationDraft,completeRegistrationDraft,discardRegistrationDraft,reviewTeacherRegistration } from './registration-drafts';
async function body(request:Request){const text=await request.text();if(text.length>2000000)throw new AppError(413,'The request is too large.');try{return text?JSON.parse(text):{};}catch{throw new AppError(400,'Send valid JSON.');}}
async function publicRoute(request:Request,path:string[]){
 const params=new URL(request.url).searchParams;
 if(path[1]==='config'&&request.method==='GET'){
  if(!process.env.DATABASE_URL)return ok({configured:false,editions:[],competitions:[],content:[]});
  const [editions,competitions,content]=await Promise.all([db.query("SELECT * FROM editions WHERE state<>'draft' ORDER BY created_at DESC"),db.query("SELECT c.* FROM competitions c JOIN editions e ON e.id=c.edition_id WHERE c.status='approved' AND e.state<>'draft' ORDER BY c.title"),db.query('SELECT * FROM site_content WHERE approved')]);return ok({configured:true,editions:editions.rows,competitions:competitions.rows,content:content.rows});
 }
 if(path[1]==='schools'&&request.method==='GET'){
  if(!process.env.DATABASE_URL)return ok({items:[],total:0,page:1,pageSize:25});
  return ok(await publicSchools(db,params));
 }
 if(path[1]==='partner-enquiries'&&path.length===2&&request.method==='POST'){
  if(!process.env.DATABASE_URL)throw new AppError(503,'Partner enquiries are not available in this preview.');
  return ok(await createPartnerEnquiry(db,await body(request)),201);
 }
 if(path[1]==='nominations'&&request.method==='POST'){
  await legalGate();const v=z.object({name:z.string().trim().min(2).max(200),city:z.string().trim().min(2).max(100),state:z.string().trim().min(2).max(100),address:z.string().max(1000).default(''),nominatorContact:z.string().trim().min(5).max(254),schoolContact:z.string().max(254).optional()}).parse(await body(request));
  const {rows:[count]}=await db.query("SELECT count(*)::int count FROM school_nominations WHERE nominator_contact=$1 AND created_at>now()-interval '1 day'",[v.nominatorContact]);if(count.count>=5)throw new AppError(429,'Too many nominations for this contact. Contact support.');
  const reference=`NOM-${id().slice(0,12).toUpperCase()}`;await db.query('INSERT INTO school_nominations(id,reference,name,city,state,address,nominator_contact,school_contact) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id(),reference,v.name,v.city,v.state,v.address,v.nominatorContact,v.schoolContact??null]);return ok({reference,status:'pending'},201);
 }
 if(path[1]==='showcase'&&path.length===5&&path[3]==='media'&&['GET','HEAD'].includes(request.method))return publicMedia(request,path[2],path[4]);
 if(path[1]==='showcase'&&path.length===2&&request.method==='GET'){
  if(!process.env.DATABASE_URL)return ok({items:[]});
  return ok({items:await showcaseList(db)});
 }
 throw new AppError(404,'Page not found.');
}
async function legalGate(){if(!process.env.DATABASE_URL)throw new AppError(503,'Registration services have not been configured yet.');const {rows}=await db.query("SELECT key FROM site_content WHERE key IN ('privacy','terms') AND approved AND body<>''");if(rows.length!==2)throw new AppError(503,'Registration will open after the participation terms and privacy information are approved.');}
export async function handleRequest(request:Request,path:string[]){
 try{
  if(!['GET','HEAD','OPTIONS'].includes(request.method))assertSameOrigin(request,process.env.APP_ORIGIN||(process.env.NODE_ENV!=='production'?new URL(request.url).origin:''));
  if(path[0]==='public')return await publicRoute(request,path);
  if(path[0]==='health')return ok({service:'Youth Eco Summit',configured:!!process.env.DATABASE_URL});
  if(path[0]==='auth'){const response=await authAction(request,path);if(response)return response;throw new AppError(404,'Authentication action not found.');}
  const actor=await getActor(request);if(!actor)throw new AppError(401,'Sign in to continue.');
  if(path[0]==='uploads'||path[0]==='media'){const response=await storageAction(request,actor,path);if(response)return response;throw new AppError(404,'File action not found.');}
  if(path[0]==='registration-drafts'){
   if(path.length===1&&request.method==='GET')return ok(await listRegistrationDrafts(db,actor,new URL(request.url).searchParams));
   if(path.length===1&&request.method==='PUT'){await legalGate();return ok(await saveRegistrationDraft(db,actor,await body(request)));}
   if(path.length===3&&path[2]==='complete'&&request.method==='POST'){await legalGate();return ok(await completeRegistrationDraft(db,actor,path[1],await body(request)));}
   if(path.length===2&&request.method==='DELETE'){const v=z.object({lockVersion:z.number().int().min(0)}).parse(await body(request));return ok(await discardRegistrationDraft(db,actor,path[1],v.lockVersion));}
  }
  if(path[0]==='participant'&&request.method==='GET')return ok(await participantDashboard(db,actor));
  if(path[0]==='schools'&&path[1]&&path[2]==='dashboard'&&path.length===3&&request.method==='GET')return ok(await schoolDashboard(db,actor,path[1],new URL(request.url).searchParams));
  if(path[0]==='schools'&&path[1]&&path[2]==='claim'&&request.method==='POST')return ok(await claimSchool(db,actor,path[1]));
  if(path[0]==='schools'&&request.method==='POST'){await legalGate();return ok(await createSchool(db,actor,await body(request)),201);}
  if(path[0]==='schools'&&path[1]&&request.method==='PUT')return ok(await updateSchool(db,actor,path[1],await body(request)));
  if(path[0]==='students'&&request.method==='POST'){await legalGate();return ok(await createStudent(db,actor,await body(request)),201);}
  if(path[0]==='consents'&&path[1]==='publication'&&request.method==='POST')return ok(await publicationConsent(db,actor,await body(request)));
  if(path[0]==='entries'){
   if(path[1]&&path[2]==='invite'&&request.method==='POST')return ok(await inviteTeam(db,actor,path[1],await body(request)));
   if(!path[1]&&request.method==='POST')return ok(await createEntry(db,actor,await body(request)),201);
   if(path[1]&&request.method==='GET')return ok(await entryDetail(db,actor,path[1]));
   if(path[1]&&request.method==='PUT')return ok(await updateEntry(db,actor,path[1],await body(request)));
   if(path[1]&&path[2]==='submit'&&request.method==='POST'){const v=z.object({lockVersion:z.number().int().min(0)}).parse(await body(request));return ok(await submitEntry(db,actor,path[1],v.lockVersion));}
  }
  if(path[0]==='teams'&&path[1]==='join'&&request.method==='POST')return ok(await joinTeam(db,actor,await body(request)));
  if(path[0]==='judge'){
   if(!path[1]&&request.method==='GET')return ok(await judgeQueue(db,actor,new URL(request.url).searchParams));
   if(path[1]&&request.method==='GET')return ok(await assignmentDetail(db,actor,path[1]));
   if(path[1]&&(request.method==='PUT'||request.method==='POST'&&path[2]==='submit'))return ok(await saveReview(db,actor,path[1],await body(request),request.method==='POST'));
   if(path[1]==='decisions'&&request.method==='POST')return ok(await recordDecision(db,actor,await body(request)));
  }
  if(path[0]==='admin'){
   const resource=path[1],params=new URL(request.url).searchParams;
   if(resource==='teachers'&&path[2]&&request.method==='PATCH')return ok(await reviewTeacherRegistration(db,actor,path[2],await body(request)));
   if(resource==='exports'&&request.method==='GET')return await exportData(db,actor,params);
   if(resource==='publications'&&request.method==='POST')return ok(await publish(db,actor,await body(request)));
   if(resource==='imports'&&path[2]==='preview'&&request.method==='POST')return ok(await importPreview(db,actor,await body(request)));
   if(resource==='imports'&&path[2]==='commit'&&request.method==='POST')return ok(await commitImport(db,actor,await body(request)));
   if(resource==='trash'&&request.method==='POST'){
    if(path[2]==='preview')return ok(await deletionPreview(db,actor,await body(request)));
    if(path[2]&&path[3]==='restore')return ok(await restore(db,actor,path[2]));
    if(path[2]&&path[3]==='purge'){const v=z.object({confirmation:z.string()}).parse(await body(request));return ok(await requestPurge(db,actor,path[2],v.confirmation));}
    return ok(await trash(db,actor,await body(request)));
   }
   if(request.method==='GET')return ok(await adminList(db,actor,resource,params));
   if(request.method==='POST')return ok(await adminCreate(db,actor,resource,await body(request)),201);
   if(request.method==='PATCH'&&path[2])return ok(await adminPatch(db,actor,resource,path[2],await body(request)));
  }
  throw new AppError(404,'Action not found.');
 }catch(error){
  if(error instanceof z.ZodError)return Response.json({error:'Please check the highlighted information.',fields:z.flattenError(error)},{status:422,headers:{'Cache-Control':'no-store'}});
  if(error instanceof AppError)return Response.json({error:error.message},{status:error.status,headers:{'Cache-Control':'no-store'}});
  const code=(error as {code?:string})?.code;
  if(code==='23505')return Response.json({error:'This record already exists. Reload to view the current record.'},{status:409});
  if(['23503','23514','22P02'].includes(code??''))return Response.json({error:'A referenced record or value is invalid. Check the form and try again.'},{status:422});
  const incident=id();console.error(JSON.stringify({event:'request_failed',incident,code:code??'internal',path:path.slice(0,2)}));
  return Response.json({error:`The service could not complete this request. Retry or contact support with reference ${incident}.`},{status:503,headers:{'Cache-Control':'no-store'}});
 }
}
