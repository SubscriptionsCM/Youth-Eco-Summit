import type { Db } from './db';
import { routeEntries } from './judging';
import { verifyAsset,purgeObjects } from './storage';
import { executePurge } from './trash';
import { verifyHistoricalAsset } from './historical-files';
export async function runJob(db:Db){
 const job=await db.transaction<Record<string,any>|null>(async tx=>{
  await tx.query("UPDATE jobs SET status='pending',locked_at=NULL,run_after=now() WHERE status='running' AND locked_at<now()-interval '15 minutes'");
  const {rows:[found]}=await tx.query("SELECT * FROM jobs WHERE status='pending' AND run_after<=now() ORDER BY run_after,created_at FOR UPDATE SKIP LOCKED LIMIT 1");
  if(!found)return null;
  await tx.query("UPDATE jobs SET status='running',attempts=attempts+1,locked_at=now(),updated_at=now() WHERE id=$1",[found.id]);return {...found,attempts:found.attempts+1};
 });
 if(!job)return false;
 const heartbeat=setInterval(()=>{void db.query("UPDATE jobs SET locked_at=now() WHERE id=$1 AND status='running'",[job.id]).catch(()=>{});},30000);
 try{
  if(job.kind==='route')await routeEntries(db);
  else if(job.kind==='verify_asset')await verifyAsset(db,job.payload.assetId);
  else if(job.kind==='verify_historical_asset')await verifyHistoricalAsset(db,job.payload.assetId);
  else if(job.kind==='purge')await executePurge(db,job.payload.batchId,purgeObjects);
  else throw new Error('Unrecognized job kind');
  await db.query("UPDATE jobs SET status='complete',locked_at=NULL,last_error=NULL,updated_at=now() WHERE id=$1",[job.id]);
 }catch{
  const failed=job.attempts>=5;await db.query("UPDATE jobs SET status=$2,run_after=now()+($3 * interval '1 second'),locked_at=NULL,last_error=$4,updated_at=now() WHERE id=$1",[job.id,failed?'failed':'pending',Math.min(300,2**job.attempts),'Operation failed. Check provider health, retained file integrity and dependencies before retrying.']);
  console.error(JSON.stringify({event:'job_failed',jobId:job.id,kind:job.kind,attempts:job.attempts,terminal:failed}));
 }finally{clearInterval(heartbeat);}
 return true;
}
