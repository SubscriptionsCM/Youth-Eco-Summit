import { readFile, realpath, stat, mkdir, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { db } from '../src/server/db';
import { archiveWordPress, validateWordPressExport, verifyWordPressArchive, type Attachment } from '../src/server/wordpress-migration';
import { objectStore } from '../src/server/storage/provider';
import { retainWordPressFilesystemAttachment } from './lib/wordpress-storage';
import { FileSystemStore } from '../src/server/storage/filesystem';

const args=process.argv.slice(2),manifest=args.find(arg=>!arg.startsWith('--'));
if(!manifest)throw new Error('Usage: npm run wordpress:migrate -- .local/export/export.json [--offline | --commit | --verify]');
const data=validateWordPressExport(JSON.parse(await readFile(manifest,'utf8'))),root=await realpath(dirname(resolve(manifest)));
if(process.env.MIGRATION_DATABASE_URL)process.env.DATABASE_URL=process.env.MIGRATION_DATABASE_URL;
async function localFile(file:Attachment) {
 const path=await realpath(resolve(root,file.path)),within=relative(root,path);
 if(within.startsWith('..')||isAbsolute(within))throw new Error('Attachment resolves outside the private export directory.');
 const info=await stat(path);if(!info.isFile()||info.size!==file.bytes)throw new Error('Attachment size mismatch.');
 const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);
 if(hash.digest('hex')!==file.sha256)throw new Error('Attachment SHA256 mismatch.');
 return path;
}
for(const file of data.attachments)await localFile(file);
if(args.includes('--offline')){console.log(JSON.stringify({valid:true,records:data.records.length,attachments:data.attachments.length,bytes:data.attachments.reduce((sum,file)=>sum+file.bytes,0)}));process.exit(0);}
if(!process.env.DATABASE_URL)throw new Error('Set the target DATABASE_URL privately or use --offline.');
const target=new URL(process.env.DATABASE_URL);
if(args.includes('--commit')&&process.env.WORDPRESS_MIGRATION_TARGET!==target.hostname)throw new Error('Set WORDPRESS_MIGRATION_TARGET to the reviewed database hostname before committing.');
const bucket=process.env.SUPABASE_STORAGE_BUCKET||'yes-private';
async function object(file:Attachment,copy:boolean) {
 if(process.env.STORAGE_PROVIDER==='filesystem'){
  const store=objectStore();if(!(store instanceof FileSystemStore))throw new Error('Filesystem archive storage is not configured.');
  return retainWordPressFilesystemAttachment(store,data.source,file,copy?await localFile(file):undefined);
 }
 const service=process.env.SUPABASE_SERVICE_ROLE_KEY,url=process.env.SUPABASE_URL;
 if(!service||!url)throw new Error('Private Supabase storage credentials are required for attachment transfer.');
 const base=new URL(url);if(base.protocol!=='https:')throw new Error('Supabase storage must use HTTPS.');
 const storageKey=`wordpress/${createHash('sha256').update(data.source+':'+file.sourceId).digest('hex')}/${file.sha256}`;
 const endpoint=new URL(`/storage/v1/object/${encodeURIComponent(bucket)}/${storageKey}`,base);
 const headers={Authorization:`Bearer ${service}`,apikey:service};
 if(copy){
  const path=await localFile(file);
  const result=await fetch(endpoint,{method:'POST',headers:{...headers,'Content-Type':file.mimeType,'Content-Length':String(file.bytes),'x-upsert':'false'},body:createReadStream(path) as unknown as BodyInit,duplex:'half',redirect:'error',signal:AbortSignal.timeout(600000)} as RequestInit&{duplex:string});
  if(!result.ok&&![400,409].includes(result.status))throw new Error(`Private attachment copy failed (${result.status}).`);
  // Even a duplicate response is accepted only after reading and hashing the object.
 }
 const result=await fetch(endpoint,{headers,redirect:'error',signal:AbortSignal.timeout(600000)});
 if(!result.ok||!result.body)throw new Error('Private attachment could not be read back.');
 const hash=createHash('sha256');let bytes=0;
 const reader=result.body.getReader();
 try { while(true){const {value,done}=await reader.read();if(done)break;hash.update(value);bytes+=value.length;if(bytes>file.bytes)throw new Error('Remote attachment is larger than its manifest.');} } finally { reader.releaseLock(); }
 return {storageKey,sha256:hash.digest('hex'),bytes};
}
try {
 const report=args.includes('--verify')?await verifyWordPressArchive(db,data,file=>object(file,false)):await archiveWordPress(db,data,{commit:args.includes('--commit'),verifyAttachment:file=>object(file,true)});
 await mkdir('.local/migration-reports',{recursive:true});
 const reportPath=`.local/migration-reports/wordpress-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
 await writeFile(reportPath,JSON.stringify(report,null,2),{flag:'wx',mode:0o600});
 console.log(JSON.stringify({...report,reportPath}));
 if('ok' in report&&!report.ok)process.exitCode=1;
}catch(error){console.error(error instanceof Error?error.message:'Migration failed.');process.exitCode=1;}
finally{setTimeout(()=>process.exit(process.exitCode||0),50);}
