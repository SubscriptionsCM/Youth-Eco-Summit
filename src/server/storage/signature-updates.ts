import { execFile } from 'node:child_process';
import { isAbsolute } from 'node:path';

export type SignatureUpdateOptions = {shell:false;windowsHide:true;timeout:number;killSignal:'SIGKILL';maxBuffer:number};
export type SignatureUpdateDependencies = {run?:(command:string,args:string[],options:SignatureUpdateOptions)=>Promise<void>;now?:()=>number;log?:(event:{event:string})=>void};

const runUpdater:NonNullable<SignatureUpdateDependencies['run']>=(command,args,options)=>new Promise((resolve,reject)=>{
 execFile(command,args,options,error=>{if(error)reject(error);else resolve();});
});

/** Called serially between worker jobs so a scan cannot overlap its own update. */
export function createSignatureUpdater(command?:string,dependencies:SignatureUpdateDependencies={}):()=>Promise<boolean> {
 const run=dependencies.run || runUpdater;
 const now=dependencies.now || Date.now;
 const log=dependencies.log || (event=>console.error(JSON.stringify(event)));
 let nextUpdateAt=0;
 return async()=>{
  if(!command||now()<nextUpdateAt)return false;
  try {
   if(!isAbsolute(command)||command.length>4096||/[\u0000-\u001F\u007F]/.test(command))throw new Error('Invalid signature updater configuration.');
   await run(command,[],{shell:false,windowsHide:true,timeout:600000,killSignal:'SIGKILL',maxBuffer:65536});
   nextUpdateAt=now()+12*60*60*1000;
   return true;
  }catch {
   nextUpdateAt=now()+60*60*1000;
   log({event:'file_scan_signature_update_failed'});
   return false;
  }
 };
}
