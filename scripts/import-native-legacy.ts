import { readFile, realpath, stat, mkdir, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { db } from '../src/server/db';
import { archiveWordPress, fingerprint, validateWordPressExport, type Attachment, type WordPressExport } from '../src/server/wordpress-migration';
import { projectCurrentWordPressSchoolAliases, projectWordPressSchools } from '../src/server/wordpress-projection';
import { objectStore, isMissing } from '../src/server/storage/provider';
import { FileSystemStore } from '../src/server/storage/filesystem';
import { retainWordPressAttachment, retainWordPressFilesystemAttachment } from './lib/wordpress-storage';
import { buildWordPressDelta, type RetainedWordPressSnapshot } from './lib/wordpress-delta';
import { archiveWordPressVersions } from './lib/wordpress-versions';
import { currentFormSnapshot, currentSourceSnapshot, importNativeLegacyAccounts, NativeImportConflict, validateNativeAccounts, validateStaffMappings } from './lib/native-legacy-import';

const args=process.argv.slice(2),manifest=args[0];
if(!manifest||manifest.startsWith('--')||args.slice(1).some(arg=>!['--commit','--verify','--offline'].includes(arg)&&!arg.startsWith('--legacy=')&&!arg.startsWith('--staff-mappings=')))throw new Error('Usage: tsx scripts/import-native-legacy.ts PRIVATE_EXPORT.json [--legacy=PRIVATE_LEGACY.json] [--staff-mappings=PRIVATE_REVIEWED.json] [--offline|--commit|--verify]');
if(args.filter(arg=>arg.startsWith('--staff-mappings=')).length>1)throw new Error('Choose one reviewed staff mapping file.');
if(args.filter(arg=>['--commit','--verify','--offline'].includes(arg)).length>1)throw new Error('Choose one migration mode.');
const commit=args.includes('--commit'),verify=args.includes('--verify'),offline=args.includes('--offline');
const paths=[manifest,...args.filter(arg=>arg.startsWith('--legacy=')).map(arg=>arg.slice(9))];
const exports:WordPressExport[]=[],localFiles=new Map<string,string>();
let accounts:ReturnType<typeof validateNativeAccounts>|undefined;
for(const [index,path] of paths.entries()){
 const raw=JSON.parse(await readFile(path,'utf8')),data=validateWordPressExport(raw);
 if(index===0){
  accounts=validateNativeAccounts(raw.nativeAccounts);
  if(accounts.source!==data.source||accounts.capturedAt!==data.capturedAt)throw new Error('Account sidecar does not match its source snapshot.');
  const users=new Map(data.records.filter(record=>record.kind==='user').map(record=>[record.sourceId,record.payload]));
  if(users.size!==accounts.accounts.length||accounts.accounts.some(account=>{
   const user=users.get(account.sourceUserId);
   return !user||String(user.ID)!==account.sourceUserId||user.user_login!==account.username||String(user.user_email).trim().toLowerCase()!==account.email||user.user_pass!==account.passwordHash;
  }))throw new Error('Account credentials do not match the corresponding source records.');
 }
 if(Array.isArray(raw.issues)&&raw.issues.length)throw new Error('Source export has unresolved file issues; reconcile the private issues before migration.');
 const root=await realpath(dirname(resolve(path)));
 for(const file of data.attachments){
  if(localFiles.has(file.sourceId))throw new Error('Duplicate attachment source identity across exports.');
  localFiles.set(file.sourceId,resolve(root,file.path));
 }
 exports.push(data);
}
const primary=exports[0];
if(exports.some(data=>data.source!==primary.source))throw new Error('Every export must use the same exact source origin.');
const sourceData=validateWordPressExport({...primary,
 records:exports.flatMap(data=>data.records),
 attachments:exports.flatMap(data=>data.attachments),
 counts:{records:exports.reduce((n,data)=>n+data.records.length,0),attachments:exports.reduce((n,data)=>n+data.attachments.length,0)},
});
const combined=validateWordPressExport({...sourceData,records:[...sourceData.records,currentFormSnapshot(primary),currentSourceSnapshot(sourceData)],counts:{...sourceData.counts,records:sourceData.counts.records+2}});
const staffPath=args.find(arg=>arg.startsWith('--staff-mappings='))?.slice(17);
const staffMappings=staffPath?validateStaffMappings(JSON.parse(await readFile(staffPath,'utf8'))):undefined;
if(staffMappings&&staffMappings.source!==combined.source)throw new Error('Reviewed staff mappings belong to another source.');
const accountOptions={staffMappings,sourceUsers:primary.records};
async function localFile(file:Attachment){
 const location=localFiles.get(file.sourceId);
 if(!location)throw new Error('Attachment has no export-local source.');
 const path=await realpath(location),owner=exports.find(data=>data.attachments.some(candidate=>candidate.sourceId===file.sourceId))!;
 const index=exports.indexOf(owner),root=await realpath(dirname(resolve(paths[index]))),within=relative(root,path);
 if(!within||within.startsWith('..')||isAbsolute(within))throw new Error('Attachment escapes its private export directory.');
 const info=await stat(path);if(!info.isFile()||info.size!==file.bytes)throw new Error('Attachment source size mismatch.');
 const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);
 if(hash.digest('hex')!==file.sha256)throw new Error('Attachment source checksum mismatch.');
 return path;
}
if(offline){
 for(const file of combined.attachments)await localFile(file);
 console.log(JSON.stringify({valid:true,sourceAccounts:accounts!.accounts.length,records:combined.records.length,attachments:combined.attachments.length,bytes:combined.attachments.reduce((n,file)=>n+file.bytes,0)}));
 process.exit(0);
}
if(process.env.MIGRATION_DATABASE_URL)process.env.DATABASE_URL=process.env.MIGRATION_DATABASE_URL;
if(!process.env.DATABASE_URL)throw new Error('Configure the private target database or use --offline.');
if(commit&&process.env.WORDPRESS_MIGRATION_TARGET!==new URL(process.env.DATABASE_URL).hostname)throw new Error('Set WORDPRESS_MIGRATION_TARGET to the reviewed database hostname before committing.');

const store=objectStore();
async function retainedFile(file:Attachment,copy:boolean){
 const storageKey='wordpress/'+createHash('sha256').update(combined.source+':'+file.sourceId).digest('hex')+'/'+file.sha256;
 let path:string|undefined;
 if(copy){try{await store.head(storageKey);}catch(error){if(!isMissing(error))throw error;path=await localFile(file);}}
 return store instanceof FileSystemStore
  ? retainWordPressFilesystemAttachment(store,combined.source,file,path)
  : retainWordPressAttachment(store,combined.source,file,path);
}
async function retainedSnapshot():Promise<RetainedWordPressSnapshot>{
 const {rows:records}=await db.query('SELECT kind,source_id,payload,checksum FROM wordpress_records WHERE source=$1',[combined.source]);
 const {rows:attachments}=await db.query('SELECT a.*,r.source_id entry_source_id FROM wordpress_attachments a JOIN wordpress_records r ON r.id=a.entry_record_id WHERE a.source=$1',[combined.source]);
 return {source:combined.source,records:records.map(row=>({kind:row.kind,sourceId:row.source_id,payload:row.payload,checksum:row.checksum})),
  attachments:attachments.map(row=>({sourceId:row.source_id,entryId:row.entry_source_id,sha256:row.checksum,bytes:Number(row.byte_size),filename:row.filename,mimeType:row.mime_type}))};
}
async function verifyRecords(){
 let records=0;
 for(const record of combined.records){
  const {rows:[old]}=await db.query('SELECT id,payload,checksum FROM wordpress_records WHERE source=$1 AND kind=$2 AND source_id=$3',[combined.source,record.kind,record.sourceId]);
  if(!old||fingerprint(old.payload)!==old.checksum)throw new Error('Retained baseline record is missing or corrupt.');
  const checksum=fingerprint(record.payload);
  if(checksum!==old.checksum){
   const {rows:[version]}=await db.query('SELECT payload,baseline_checksum FROM wordpress_record_versions WHERE record_id=$1 AND checksum=$2',[old.id,checksum]);
   if(!version||version.baseline_checksum!==old.checksum||fingerprint(version.payload)!==checksum)throw new Error('Current source version is not retained.');
  }
  records++;
 }
 for(const file of combined.attachments){
  const {rows:[old]}=await db.query('SELECT a.*,r.source_id entry_source_id FROM wordpress_attachments a JOIN wordpress_records r ON r.id=a.entry_record_id WHERE a.source=$1 AND a.source_id=$2',[combined.source,file.sourceId]);
  if(!old||old.entry_source_id!==file.entryId||old.checksum!==file.sha256||Number(old.byte_size)!==file.bytes||old.filename!==file.filename||old.mime_type!==file.mimeType)throw new Error('Retained attachment metadata does not match the source.');
  const retained=await retainedFile(file,false);
  if(retained.storageKey!==old.storage_key)throw new Error('Retained attachment storage key mismatch.');
 }
 const staffIds=new Set(staffMappings?.mappings.map(mapping=>mapping.sourceUserId)??[]),participants=accounts!.accounts.filter(account=>!staffIds.has(account.sourceUserId));
 const {rows:[counts]}=await db.query('SELECT count(*)::int n FROM wordpress_account_identities w JOIN users u ON u.id=w.user_id JOIN native_participant_accounts n ON n.user_id=u.id WHERE w.source=$1 AND w.source_user_id=ANY($2::text[]) AND u.role=$3 AND u.password_hash IS NOT NULL',[combined.source,participants.map(account=>account.sourceUserId),'participant']);
 if(counts.n!==participants.length)throw new Error('Native participant credential coverage does not match the source.');
 for(const mapping of staffMappings?.mappings??[]){
  const {rows:[staff]}=await db.query('SELECT u.role,u.active,u.password_hash IS NOT NULL has_password,u.totp_secret IS NOT NULL has_totp,n.user_id participant_id FROM wordpress_account_identities w JOIN users u ON u.id=w.user_id LEFT JOIN native_participant_accounts n ON n.user_id=u.id WHERE w.source=$1 AND w.source_user_id=$2 AND u.id=$3',[combined.source,mapping.sourceUserId,mapping.userId]);
  if(!staff||staff.role!==mapping.expectedRole||!staff.active||!staff.has_password||!staff.has_totp||staff.participant_id)throw new Error('Reviewed native staff preservation does not verify.');
 }
 return {ok:true,records,attachments:combined.attachments.length,nativeAccounts:counts.n,preservedStaff:staffIds.size};
}
try{
 const delta=buildWordPressDelta(combined,await retainedSnapshot());
 if(delta.report.attachmentConflicts.length)throw new Error('An existing source attachment changed; retained data was not overwritten.');
 const accountPreview=await importNativeLegacyAccounts(db,accounts,accountOptions);
 let report:Record<string,unknown>={source:combined.source,capturedAt:combined.capturedAt,counts:delta.report.counts,recordsByKind:delta.report.recordsByKind,accounts:accountPreview,committed:commit};
 if(verify)report={...report,verification:await verifyRecords()};
 if(commit){
  // Metadata and account conflicts are checked before any object copy or database write.
  await archiveWordPress(db,delta.delta,{commit:true,verifyAttachment:file=>retainedFile(file,true)});
  const changed=new Set(delta.report.recordConflicts.map(record=>record.kind+':'+record.sourceId));
  const versions={...combined,records:combined.records.filter(record=>changed.has(record.kind+':'+record.sourceId)),attachments:[],counts:{records:changed.size,attachments:0}};
  const versionReport=await archiveWordPressVersions(db,versions,{commit:true});
  const schools=await projectWordPressSchools(db,combined.source,{commit:true});
  const currentSchoolAliases=await projectCurrentWordPressSchoolAliases(db,combined.source,{commit:true});
  const migratedAccounts=await importNativeLegacyAccounts(db,accounts,{...accountOptions,commit:true});
  report={...report,versions:versionReport,schools,currentSchoolAliases,accounts:migratedAccounts,verification:await verifyRecords()};
 }
 await mkdir('.local/migration-reports',{recursive:true,mode:0o700});
 const reportPath='.local/migration-reports/native-legacy-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
 await writeFile(reportPath,JSON.stringify(report,null,2),{flag:'wx',mode:0o600});
 console.log(JSON.stringify({...report,reportPath}));
}catch(error){
 if(error instanceof NativeImportConflict)console.error(JSON.stringify({error:'Account identity reconciliation required.',issues:error.issues}));
 else console.error(error instanceof Error?error.message:'Native legacy migration failed.');
 process.exitCode=1;
}finally{setTimeout(()=>process.exit(process.exitCode||0),50);}
