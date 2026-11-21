import {db} from '../src/server/db';
import {backfillParticipantKinds} from '../src/server/participant-kind-backfill';

const args=new Set(process.argv.slice(2));
if([...args].some(value=>!['--commit','--registration-history'].includes(value)))throw new Error('Use --registration-history and optionally --commit. Default is a read-only preview.');
try{
 console.log(JSON.stringify(await backfillParticipantKinds(db,{commit:args.has('--commit'),registrationHistory:args.has('--registration-history')})));
}catch(error){
 console.error(JSON.stringify({error:'Participant classification could not finish; no partial update was committed.',code:(error as {code?:string}).code??'classification_failed'}));
 process.exitCode=1;
}
