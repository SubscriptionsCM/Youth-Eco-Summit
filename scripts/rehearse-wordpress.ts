import { readFile, realpath, mkdir, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { testDb } from '../tests/helpers/db';
import { archiveWordPress, verifyWordPressArchive, validateWordPressExport, type Attachment } from '../src/server/wordpress-migration';
const manifest=process.argv[2];if(!manifest)throw new Error('Provide a private export.json path.');
const raw=await readFile(manifest),data=validateWordPressExport(JSON.parse(raw.toString('utf8'))),root=await realpath(dirname(resolve(manifest)));
const check=async(file:Attachment)=>{
 const path=await realpath(resolve(root,file.path)),within=relative(root,path);
 if(within.startsWith('..')||isAbsolute(within))throw new Error('Attachment escaped the private export.');
 const hash=createHash('sha256');let bytes=0;for await(const chunk of createReadStream(path)){hash.update(chunk);bytes+=chunk.length;}
 return {sha256:hash.digest('hex'),bytes,storageKey:`wordpress/${createHash('sha256').update(data.source+':'+file.sourceId).digest('hex')}/${file.sha256}`};
};
const fixture=await testDb();
try{
 const preview=await archiveWordPress(fixture.db,data);
 const migration=await archiveWordPress(fixture.db,data,{commit:true,verifyAttachment:check});
 const retry=await archiveWordPress(fixture.db,data,{commit:true,verifyAttachment:check});
 const integrity=await verifyWordPressArchive(fixture.db,data,check);
 const report={scope:'Isolated local PostgreSQL rehearsal; no Supabase or production writes',manifestSha256:createHash('sha256').update(raw).digest('hex'),preview,migration,retry,integrity,bytes:data.attachments.reduce((sum,file)=>sum+file.bytes,0)};
 await mkdir('.local/migration-reports',{recursive:true});
 const reportPath=`.local/migration-reports/rehearsal-${Date.now()}.json`;
 await writeFile(reportPath,JSON.stringify(report,null,2),{flag:'wx',mode:0o600});
 console.log(JSON.stringify({...report,reportPath}));
 if(!integrity.ok||retry.inserted!==0)process.exitCode=1;
}finally{await fixture.close();}
