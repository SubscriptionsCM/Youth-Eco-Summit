import { db } from '../src/server/db';
import { runJob } from '../src/server/jobs';
import { routeEntries } from '../src/server/judging';
import { createSignatureUpdater } from '../src/server/storage/signature-updates';
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required.');
let stopping=false,routing=false;
for(const signal of ['SIGTERM','SIGINT'] as const)process.on(signal,()=>{stopping=true;});
async function reconcile(){if(routing||stopping)return;routing=true;try{await routeEntries(db);}catch{console.error(JSON.stringify({event:'routing_reconciliation_failed'}));}finally{routing=false;}}
const timer=setInterval(()=>void reconcile(),3000);
const updateSignatures=createSignatureUpdater(process.env.FILE_SCAN_UPDATE_COMMAND);
console.log('Worker started. Routing reconciles independently of large-file verification every 3 seconds.');
await reconcile();
while(!stopping){
 await updateSignatures();
 if(stopping)break;
 try{await runJob(db);}catch{console.error(JSON.stringify({event:'worker_cycle_failed'}));}
 await new Promise(resolve=>setTimeout(resolve,1000));
}
clearInterval(timer);
while(routing)await new Promise(resolve=>setTimeout(resolve,100));
