export class UploadTimeoutError extends Error {
 constructor(){super('The upload request took too long. Retry the same file.');}
}
class UploadResponseError extends Error {
 constructor(public status:number){super('The upload was interrupted. Retry the same file.');}
}
const cancelled=()=>new DOMException('Upload cancelled.','AbortError');

/** Bound each request, and propagate cancellation through fetch and response reads. */
export async function runUploadRequest<T>(request:(signal:AbortSignal)=>Promise<T>,signal:AbortSignal,timeoutMs=30000):Promise<T>{
 if(signal.aborted)throw cancelled();
 const controller=new AbortController();let timedOut=false;
 const abort=()=>controller.abort();
 signal.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
 try{return await request(controller.signal);}
 catch(error){if(signal.aborted)throw cancelled();if(timedOut)throw new UploadTimeoutError();throw error;}
 finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
}
function waitToRetry(signal:AbortSignal,milliseconds:number){
 return new Promise<void>((resolve,reject)=>{
  const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);};
  const abort=()=>{cleanup();reject(cancelled());};
  const timer=setTimeout(()=>{cleanup();resolve();},milliseconds);
  signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
 });
}
/** Hash bounded slices so mobile devices never need the whole video in memory. */
export async function checksumFile(file:Blob,signal:AbortSignal,onProgress:(percent:number)=>void){
 const hasher=sha256.create(),chunkSize=4*1024*1024;
 for(let offset=0;offset<file.size;offset+=chunkSize){
  if(signal.aborted)throw cancelled();
  const bytes=await file.slice(offset,Math.min(offset+chunkSize,file.size)).arrayBuffer();
  if(signal.aborted)throw cancelled();
  hasher.update(new Uint8Array(bytes));onProgress(Math.round(Math.min(offset+chunkSize,file.size)/file.size*100));
  if(offset+chunkSize<file.size)await waitToRetry(signal,0);
 }
 if(signal.aborted)throw cancelled();
 return Array.from(hasher.digest(),byte=>byte.toString(16).padStart(2,'0')).join('');
}
/** Only exact, idempotent part PUTs (with a fresh signed URL) may be retried. */
export async function retryUploadPart(send:(signal:AbortSignal)=>Promise<Response>,signal:AbortSignal,onRetry:(attempt:number)=>void,timeoutMs=180000){
 for(let attempt=1;attempt<=3;attempt++){
  try{
   const response=await runUploadRequest(send,signal,timeoutMs);
   if(!response.ok)throw new UploadResponseError(response.status);
   return;
  }catch(error){
   if(signal.aborted)throw cancelled();
   const status=(error as {status?:number})?.status;
   const retryable=error instanceof UploadTimeoutError||error instanceof TypeError||typeof status==='number'&&(status===408||status===429||status>=500);
   if(!retryable||attempt===3)throw error;
   await waitToRetry(signal,attempt*500);onRetry(attempt+1);
  }
 }
}
import {sha256} from '@noble/hashes/sha2.js';

