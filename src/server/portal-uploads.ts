import { z } from 'zod';
import { db, type Db } from './db';
import { AppError, id, ok, type Actor } from './core';
import { getFormRecord, writableFormRecord } from './portal-forms';
import { referenceForms, enabled, type ReferenceForm } from '../domain/wordpress-forms';
import { competitionGuidelines2027 } from '../data/guidelines-2027';
import { objectStore, isMissing, type ObjectStore } from './storage/provider';
import { portalDownloadUrl, type PortalFile } from './storage/downloads';
import { ContentRejected, inspectContent, inspectFileMetadata, type FileRules } from './storage/validation';
import { scanContent } from './storage/scanner';

export function referenceFileRules(form:ReferenceForm,fieldId:string):FileRules {
 const field=form.fields.find(f=>f.id===fieldId&&f.type==='upload');
 if(!field)throw new AppError(422,'Choose a file field from this form.');
 const guideline=competitionGuidelines2027.find(g=>g.slug===form.key);
 const index=form.fields.filter(f=>f.type==='upload').findIndex(f=>f.id===fieldId);
 const rule=guideline?.fileRequirements[index];
 const mime:Record<string,string>={pdf:'application/pdf',mp4:'video/mp4',jpg:'image/jpeg',jpeg:'image/jpeg'};
 const types=rule?.types||(form.key==='partner'?['application/pdf']:(field.filetypes||[]).map((type:string)=>mime[type]).filter(Boolean));
 if(!types.length)throw new AppError(503,'The file policy needs review before uploads can open.');
 return {minCount:enabled(field.required)?1:0,maxCount:1,maxBytes:rule?.maxBytes||Number(field['upload-limit']||8)*1048576,types,
  ...(rule?.duration?{maxDurationSeconds:rule.duration.maxSeconds}:{}),...(rule?.maxHeight?{maxHeight:rule.maxHeight}:{}),...(rule?.orientation?{orientation:rule.orientation}:{}),
  ...(guideline?.wordRange&&rule?.role==='written-piece'?{minWords:guideline.wordRange.min,maxWords:guideline.wordRange.max}:{})};
}
async function fileAccess(actor:Actor|null,fileId:string,token?:string,write=false) {
 z.uuid().parse(fileId);
 const {rows:[file]}=await db.query<PortalFile & Record<string, any>>('SELECT * FROM portal_form_files WHERE id=$1',[fileId]);
 if(!file)throw new AppError(404,'File not found.');
 if(write)await writableFormRecord(db,actor,file.record_id,token);else await getFormRecord(db,actor,file.record_id,token);
 return file;
}
export async function completePortalMultipart(store:Pick<ObjectStore,'head'|'parts'|'complete'>,file:{storage_key:string;upload_id:string;expected_size:number|string;part_size:number}) {
 const assembled=async()=>{
  try{const object=await store.head(file.storage_key);if(object.ContentLength!==Number(file.expected_size))throw new AppError(409,'The retained object has an unexpected size. Contact support.');return true;}
  catch(error){if(isMissing(error))return false;throw error;}
 };
 // A prior storage completion can survive a failed database transaction. The
 // worker still hashes/scans the object before it can be accepted as ready.
 if(await assembled())return;
 const parts=await store.parts(file.storage_key,file.upload_id),count=Math.ceil(Number(file.expected_size)/file.part_size);
 if(parts.length!==count||parts.some((part,index)=>part.PartNumber!==index+1||part.Size!==Math.min(file.part_size,Number(file.expected_size)-index*file.part_size)))throw new AppError(422,'Upload every file part before completing.');
 try{await store.complete(file.storage_key,file.upload_id,parts);}
 catch(error){if(!await assembled())throw error;}
}
export async function portalUploadAction(request:Request,path:string[],actor:Actor|null,token?:string):Promise<Response> {
 const raw=await request.text();if(Buffer.byteLength(raw)>10000)throw new AppError(413,'Upload request is too large.');
 let input;try{input=raw?JSON.parse(raw):{};}catch{throw new AppError(400,'Send valid JSON.');}
 if(request.method!=='POST')throw new AppError(405,'Use POST for private file actions.');
 const store=objectStore();
 if(path[0]==='begin'){
  const v=z.object({recordId:z.uuid(),fieldId:z.string().max(100),filename:z.string().min(1).max(255),size:z.number().int().positive(),checksum:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(input);
  return db.transaction(async tx=>{
   const record=await writableFormRecord(tx,actor,v.recordId,token);
   const rules=referenceFileRules(referenceForms.find(f=>f.key===record.form_key)!,v.fieldId);
   if(v.size>rules.maxBytes)throw new AppError(422,'This file exceeds the form’s size limit.');
   const {rows:[old]}=await tx.query('SELECT * FROM portal_form_files WHERE record_id=$1 AND field_id=$2',[v.recordId,v.fieldId]);
   if(old){if(old.expected_checksum!==v.checksum||Number(old.expected_size)!==v.size)throw new AppError(409,'A different file is already retained in this field. Keep it or start a new draft.');return ok({id:old.id,partSize:old.part_size,status:old.status});}
   const fileId=id(),key=`submissions/${v.recordId}/${fileId}`,uploadId=await store.begin(key,{expectedSize:v.size,checksum:v.checksum,partSize:5242880});
   await tx.query('INSERT INTO portal_form_files(id,record_id,field_id,filename,storage_key,expected_size,expected_checksum,upload_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[fileId,v.recordId,v.fieldId,v.filename.replace(/[\r\n\0]/g,''),key,v.size,v.checksum,uploadId]);
   return ok({id:fileId,partSize:5242880,status:'pending'},201);
  });
 }
 const file=await fileAccess(actor,path[0],token,path[1]!=='download');
 if(path[1]==='part'){
  const part=z.number().int().min(1).max(Math.ceil(Number(file.expected_size)/file.part_size)).parse(input.partNumber);
  if(file.status!=='pending')throw new AppError(409,'This upload has already been completed.');
  const bytes=Math.min(file.part_size,Number(file.expected_size)-(part-1)*file.part_size);
  return ok({url:await store.sign(file.storage_key,file.upload_id,part,bytes)});
 }
 if(path[1]==='complete'){
  if(['uploaded','ready'].includes(file.status))return ok({status:file.status});
  if(file.status!=='pending')throw new AppError(409,'This upload is unavailable.');
  await completePortalMultipart(store,file as any);
  await db.transaction(async tx=>{
   await writableFormRecord(tx,actor,file.record_id,token);
   const changed=await tx.query("UPDATE portal_form_files SET status='uploaded' WHERE id=$1 AND status='pending' RETURNING id",[file.id]);
   if(changed.rows.length)await tx.query("INSERT INTO jobs(id,kind,payload) VALUES($1,'verify_portal_file',$2)",[id(),JSON.stringify({fileId:file.id})]);
  });return ok({status:'uploaded'});
 }
 if(path[1]==='download'){
  if(file.status!=='ready')throw new AppError(409,'File verification is still pending.');
  return ok({url:await portalDownloadUrl(db,store,actor,file,token)});
 }
 throw new AppError(404,'Upload action not found.');
}
export async function verifyPortalFile(database:Db,fileId:string) {
 const {rows:[file]}=await database.query('SELECT f.*,r.form_key FROM portal_form_files f JOIN portal_form_records r ON r.id=f.record_id WHERE f.id=$1',[fileId]);
 if(!file||file.status==='ready'||file.status==='rejected')return;
 if(file.status!=='uploaded')throw new Error('Upload is not complete.');
 const form=referenceForms.find(f=>f.key===file.form_key)!;
 const rules=referenceFileRules(form,file.field_id),store=objectStore();
 const identity=await store.head(file.storage_key);
 if(identity.ContentLength!==Number(file.expected_size)||(!identity.VersionId&&!identity.ETag))throw new Error('Private file identity could not be verified.');
 const stream=async()=>{const result=await store.read(file.storage_key,identity.VersionId,identity.ETag);if(!result.Body)throw new Error('Private file missing.');return result.Body as AsyncIterable<Uint8Array>;};
 try{
  const verified=await inspectContent(await stream(),{size:Number(file.expected_size),checksum:file.expected_checksum,maxBytes:rules.maxBytes,types:rules.types});
  const scan=await scanContent(await stream(),verified,rules.maxDurationSeconds);
  const metadata=await inspectFileMetadata(await stream(),verified.mimeType,rules);
  await database.query("UPDATE portal_form_files SET status='ready',mime_type=$2,metadata=$3,verified_at=now() WHERE id=$1 AND status='uploaded'",[file.id,verified.mimeType,JSON.stringify({...metadata,scan,storageVersion:identity.VersionId,storageEtag:identity.ETag})]);
 }catch(error){if(error instanceof ContentRejected){await database.query("UPDATE portal_form_files SET status='rejected',metadata=$2 WHERE id=$1",[file.id,JSON.stringify({error:error.message})]);return;}throw error;}
}
