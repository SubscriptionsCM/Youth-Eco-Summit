import {AppError,ok,type Actor} from './core';
import type {Db} from './db';
import {createJudgingRound,changeJudgingRound,assignJudgingEntries,changeJudgingAssignment,judgingQueue,judgingDetail,saveJudgingReview,judgingAdministration,listJudgingEntries,judgingFile} from './judge-portal';
import {serveRetainedFile} from './storage/downloads';
import {objectStore} from './storage/provider';

export async function judgePortalRoute(request:Request,db:Db,actor:Actor,path:string[]){
 const method=request.method,params=new URL(request.url).searchParams;
 async function body(){const text=await request.text();if(Buffer.byteLength(text)>100000)throw new AppError(413,'The review request is too large.');try{return JSON.parse(text||'{}');}catch{throw new AppError(400,'Send valid JSON.');}}
 if(path.length===0&&method==='GET')return ok(await judgingQueue(db,actor,params));
 if(path[0]==='admin'){
  if(path.length===1&&method==='GET')return ok(await judgingAdministration(db,actor,params));
  if(path[1]==='entries'&&path.length===2&&method==='GET')return ok(await listJudgingEntries(db,actor,params));
  if(path[1]==='rounds'&&path.length===2&&method==='POST')return ok(await createJudgingRound(db,actor,await body()),201);
  if(path[1]==='rounds'&&path.length===3&&method==='PATCH')return ok(await changeJudgingRound(db,actor,path[2],await body()));
  if(path[1]==='assignments'&&path.length===2&&method==='POST')return ok(await assignJudgingEntries(db,actor,await body()),201);
  if(path[1]==='assignments'&&path.length===3&&method==='PATCH')return ok(await changeJudgingAssignment(db,actor,path[2],await body()));
 }
 if(path[0]==='assignments'&&path[1]){
  if(path.length===2&&method==='GET')return ok(await judgingDetail(db,actor,path[1]));
  if(path.length===2&&method==='PUT')return ok(await saveJudgingReview(db,actor,path[1],await body(),false));
  if(path.length===3&&path[2]==='submit'&&method==='POST')return ok(await saveJudgingReview(db,actor,path[1],await body(),true));
  if(path.length===4&&path[2]==='files'&&['GET','HEAD'].includes(method)){const file=await judgingFile(db,actor,path[1],path[3]);return serveRetainedFile(request,objectStore(),file);}
 }
 throw new AppError(404,'Judging action not found.');
}
