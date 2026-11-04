import {z} from 'zod';
import type {Db} from './db';
import {AppError,type Actor,id,audit,requireAdmin} from './core';

const kindSchema=z.enum(['schools','participations','submissions']);
const requestSchema=z.object({source:z.string().trim().min(1).max(100),kind:kindSchema,rows:z.array(z.record(z.string(),z.unknown())).min(1).max(500),mapping:z.record(z.string(),z.string().max(100)).default({}),editionId:z.uuid().optional(),schoolMatches:z.record(z.string(),z.union([z.uuid(),z.literal('new')])).default({})});
type Kind=z.infer<typeof kindSchema>;
type Payload={data:Record<string,any>;editionId?:string;schoolMatch?:string};
type Stored={id:string;source:string;source_id:string;kind:Kind;payload:Payload;status:string;entity_id:string|null;preview_version:string;error:string|null};
type PreviewRow={id:string;version:string;sourceId:string;status:string;issues:string[];candidates?:{id:string;reference:string;name:string;city:string;state:string;address:string;postal_code:string}[]};
const fields:Record<Kind,string[]>={
  schools:['sourceId','name','address','city','state','postalCode','registeredAt','approval','contactName','contactRole','email','phone','originalReference'],
  participations:['sourceId','studentSourceId','name','guardianContact','emergencyContact','class','section','coordinator','schoolSourceId','createdAt','originalReference'],
  submissions:['sourceId','participationSourceId','competitionId','categoryId','answers','submittedAt','originalReference','originalState','fileReferences'],
};
function canonical(kind:Kind,input:Record<string,unknown>,mapping:Record<string,string>){
  const result:Record<string,any>={};
  for(const field of fields[kind]){
    const column=mapping[field]||field;
    if(Object.hasOwn(input,column))result[field]=input[column];
  }
  return result;
}
function validUuid(value:unknown){return z.uuid().safeParse(value).success;}
function textField(data:Record<string,any>,field:string,max=200){return typeof data[field]==='string'&&data[field].trim().length>0&&data[field].length<=max;}
function validDate(value:unknown){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)&&Number.isFinite(Date.parse(value));}
function when(value:unknown){return typeof value==='string'?new Date(value):new Date();}
async function resolvedSchool(db:Db,row:Pick<Stored,'source'|'kind'|'payload'>){
  let schoolId=row.payload.schoolMatch;
  if(!schoolId&&row.kind!=='schools'&&row.payload.data.schoolSourceId){
    schoolId=(await db.query<{entity_id:string}>("SELECT entity_id FROM import_rows WHERE source=$1 AND source_id=$2 AND kind='schools' AND status='imported'",[row.source,String(row.payload.data.schoolSourceId)])).rows[0]?.entity_id;
  }
  if(!schoolId||schoolId==='new'||!validUuid(schoolId))return null;
  return (await db.query("SELECT * FROM schools WHERE id=$1 AND trashed_at IS NULL AND NOT purging FOR SHARE",[schoolId])).rows[0]||null;
}
async function inspect(db:Db,row:Pick<Stored,'source'|'kind'|'payload'>){
  const d=row.payload.data,issues:string[]=[],candidates:PreviewRow['candidates']=[];
  if(!textField(d,'sourceId',160))issues.push('A stable sourceId is required (maximum 160 characters).');
  if(row.kind==='schools'){
    if(d.originalReference!==undefined&&d.originalReference!==''){
      if(typeof d.originalReference!=='string'||!/^[-A-Za-z0-9_./]{1,100}$/.test(d.originalReference.trim()))issues.push('originalReference must be a school ID of up to 100 letters, digits, hyphens, underscores, dots or slashes.');
      else {
        const existing=(await db.query('SELECT school_id FROM school_identifiers WHERE reference=upper(trim($1))',[d.originalReference])).rows[0];
        if(existing&&existing.school_id!==row.payload.schoolMatch)issues.push('This school ID already belongs to another record. Review the existing school match; never reuse an ID for a different branch.');
      }
    }
    if(d.registeredAt!==undefined&&!validDate(d.registeredAt))issues.push('registeredAt must be an ISO date.');
    if(!row.payload.schoolMatch){
      issues.push('Review a school match or explicitly choose new. Names never create a match automatically.');
      if(textField(d,'name')&&textField(d,'city'))candidates.push(...(await db.query<{id:string;reference:string;name:string;city:string;state:string;address:string;postal_code:string}>('SELECT id,reference,name,city,state,address,postal_code FROM schools WHERE lower(name)=lower($1) AND lower(city)=lower($2) AND trashed_at IS NULL AND NOT purging LIMIT 20',[d.name,d.city])).rows);
    }else if(row.payload.schoolMatch!=='new'&&!await resolvedSchool(db,row))issues.push('The reviewed school match no longer exists or is in Trash.');
    if(row.payload.schoolMatch==='new'){
      for(const field of ['name','address','city','state','postalCode'])if(!textField(d,field,field==='address'?1000:200))issues.push(`School ${field} is required.`);
      if(d.approval!==undefined&&!['approved','pending'].includes(d.approval))issues.push('School approval must be approved or pending.');
    }
  }else if(row.kind==='participations'){
    if(!textField(d,'name',150))issues.push('Student name is required.');
    if(d.studentSourceId!==undefined&&!textField(d,'studentSourceId',160))issues.push('studentSourceId must be a stable source identifier.');
    const grade=Number(d.class);if(!Number.isInteger(grade)||grade<1||grade>12)issues.push('Class must be an integer from 1 through 12.');
    if(d.guardianContact!==undefined&&(typeof d.guardianContact!=='string'||d.guardianContact.length>100))issues.push('Guardian contact must be text, not a student identity key.');
    if(d.createdAt!==undefined&&!validDate(d.createdAt))issues.push('createdAt must be an ISO date.');
    const edition=validUuid(row.payload.editionId)?(await db.query('SELECT * FROM editions WHERE id=$1 FOR SHARE',[row.payload.editionId])).rows[0]:null;
    if(!edition||!['archived','closed'].includes(edition.state))issues.push('Select a closed or archived edition for historical participation.');
    const school=await resolvedSchool(db,row);
    if(!school||school.status!=='active')issues.push('Select a reviewed active school match or import its reviewed school source ID first.');
  }else{
    if(!textField(d,'participationSourceId',160))issues.push('participationSourceId is required.');
    const participation=(await db.query(`SELECT p.* FROM import_rows i JOIN student_participations p ON p.id=i.entity_id JOIN students s ON s.id=p.student_id JOIN schools sc ON sc.id=p.school_id
      WHERE i.source=$1 AND i.source_id=$2 AND i.kind='participations' AND i.status='imported' AND p.trashed_at IS NULL AND s.trashed_at IS NULL AND NOT s.purging AND sc.trashed_at IS NULL AND NOT sc.purging FOR SHARE OF p,s,sc`,[row.source,String(d.participationSourceId||'')])).rows[0];
    if(!participation)issues.push('Import and reconcile the participation source row first.');
    const competition=validUuid(d.competitionId)?(await db.query('SELECT c.*,e.state edition_state FROM competitions c JOIN editions e ON e.id=c.edition_id WHERE c.id=$1 FOR SHARE OF c,e',[d.competitionId])).rows[0]:null;
    if(!competition||!['archived','closed'].includes(competition.edition_state)||competition.edition_id!==participation?.edition_id)issues.push('Competition must belong to the same closed or archived edition.');
    if(!textField(d,'categoryId',100)||!competition?.config?.categories?.some((c:{id:string})=>c.id===d.categoryId))issues.push('Use a category ID from the historical competition configuration.');
    if(d.submittedAt!==undefined&&!validDate(d.submittedAt))issues.push('submittedAt must be an ISO date.');
    if(d.answers!==undefined&&(!d.answers||typeof d.answers!=='object'||Array.isArray(d.answers)||JSON.stringify(d.answers).length>20_000))issues.push('Answers must be a JSON object no larger than 20 KB.');
    if(d.fileReferences!==undefined&&(!Array.isArray(d.fileReferences)||d.fileReferences.length>30||d.fileReferences.some((v:unknown)=>{
      try{if(typeof v!=='string'||v.length>2048)return true;const url=new URL(v);return !['http:','https:'].includes(url.protocol)||!!url.username||!!url.password;}catch{return true;}
    })))issues.push('File references must be at most 30 HTTP(S) URLs without embedded credentials.');
  }
  return {issues,candidates};
}

export async function importPreview(db:Db,actor:Actor,input:unknown){
  requireAdmin(actor);
  const parsed=requestSchema.safeParse(input);if(!parsed.success)throw new AppError(400,'Supply source, kind, up to 500 rows, and valid mappings.');
  const v=parsed.data;if(JSON.stringify(v).length>2_000_000)throw new AppError(413,'Import batches are limited to 2 MB.');
  const rows:PreviewRow[]=[],seen=new Set<string>();
  for(const raw of v.rows){
    const data=canonical(v.kind,raw,v.mapping),sourceId=typeof data.sourceId==='string'?data.sourceId.trim():'';
    if(!sourceId||sourceId.length>160){rows.push({id:'',version:'',sourceId,status:'invalid',issues:['Map a stable sourceId for every row.']});continue;}
    data.sourceId=sourceId;
    if(seen.has(sourceId)){rows.push({id:'',version:'',sourceId,status:'invalid',issues:['Duplicate sourceId within this batch.']});continue;}seen.add(sourceId);
    const existing=(await db.query<Stored>('SELECT * FROM import_rows WHERE source=$1 AND source_id=$2 AND kind=$3',[v.source,sourceId,v.kind])).rows[0];
    if(existing&&['imported','purged'].includes(existing.status)){const purged=existing.status==='purged';rows.push({id:existing.id,version:existing.preview_version,sourceId,status:purged?'purged':'duplicate',issues:purged?['This source record was permanently deleted and cannot be re-imported.']:[]});continue;}
    const matchKey=v.kind==='schools'?sourceId:String(data.schoolSourceId||'');
    const schoolMatch=Object.hasOwn(v.schoolMatches,matchKey)?v.schoolMatches[matchKey]:undefined;
    const payload:Payload={data,...(v.editionId?{editionId:v.editionId}:{}),...(schoolMatch?{schoolMatch}:{})};
    const checked=await inspect(db,{source:v.source,kind:v.kind,payload});
    const status=checked.issues.length?(v.kind==='schools'&&!payload.schoolMatch?'needs_review':'invalid'):'ready';
    const version=id();
    const saved=(await db.query<Stored>(`INSERT INTO import_rows(id,source,source_id,kind,payload,status,error,preview_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT(source,source_id,kind) DO UPDATE SET payload=EXCLUDED.payload,status=EXCLUDED.status,error=EXCLUDED.error,preview_version=EXCLUDED.preview_version,updated_at=now()
      WHERE import_rows.status NOT IN ('imported','purged') RETURNING *`,[existing?.id||id(),v.source,sourceId,v.kind,JSON.stringify(payload),status,checked.issues.join(' ')||null,version])).rows[0];
    if(!saved){const completed=(await db.query<Stored>('SELECT * FROM import_rows WHERE source=$1 AND source_id=$2 AND kind=$3',[v.source,sourceId,v.kind])).rows[0];const purged=completed.status==='purged';rows.push({id:completed.id,version:completed.preview_version,sourceId,status:purged?'purged':'duplicate',issues:purged?['This source record was permanently deleted and cannot be re-imported.']:[]});}
    else rows.push({id:saved.id,version,sourceId,status,issues:checked.issues,...(checked.candidates.length?{candidates:checked.candidates}:{})});
  }
  await audit(db,actor,'import.preview','import',v.source,{kind:v.kind,count:rows.length});
  return {rows,counts:{ready:rows.filter(r=>r.status==='ready').length,duplicates:rows.filter(r=>r.status==='duplicate').length,purged:rows.filter(r=>r.status==='purged').length,needsReview:rows.filter(r=>r.status==='needs_review').length,invalid:rows.filter(r=>r.status==='invalid').length}};
}

async function retainImportedSchoolId(tx:Db,schoolId:string,reference:string){
  const {rows}=await tx.query(`INSERT INTO school_identifiers(reference,school_id,kind) VALUES(upper(trim($1)),$2,'imported')
  ON CONFLICT(reference) DO UPDATE SET school_id=EXCLUDED.school_id WHERE school_identifiers.school_id=EXCLUDED.school_id RETURNING school_id`,[reference,schoolId]);
  if(!rows.length)throw new AppError(409,'This school ID was assigned to another record. Review the school match again.');
}
async function importSchool(tx:Db,row:Stored){
  const d=row.payload.data;
  if(row.payload.schoolMatch!=='new'){
    const school=(await resolvedSchool(tx,row))!;
    if(d.originalReference)await retainImportedSchoolId(tx,school.id,d.originalReference);
    return {entityId:school.id,missingFiles:0};
  }
  const schoolId=id();
  await tx.query('INSERT INTO schools(id,reference,name,address,city,state,postal_code,status,registered_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[schoolId,d.originalReference?.trim().toUpperCase()||`SCH-${id().slice(0,12).toUpperCase()}`,d.name,d.address,d.city,d.state,d.postalCode,d.approval==='approved'?'active':'pending',when(d.registeredAt)]);
  if(d.contactName||d.email||d.phone)await tx.query('INSERT INTO school_contacts(id,school_id,name,role,email,phone) VALUES($1,$2,$3,$4,$5,$6)',[id(),schoolId,String(d.contactName||''),String(d.contactRole||'historical contact'),String(d.email||''),String(d.phone||'')]);
  return {entityId:schoolId,missingFiles:0};
}
async function importParticipation(tx:Db,row:Stored){
  const d=row.payload.data,school=(await resolvedSchool(tx,row))!,studentKey=d.studentSourceId?`student:${d.studentSourceId}`:`participation:${row.source_id}`;
  const proposed=id();
  const claimed=await tx.query('INSERT INTO import_student_identities(source,source_student_id,student_id) VALUES($1,$2,$3) ON CONFLICT(source,source_student_id) DO NOTHING RETURNING student_id',[row.source,studentKey,proposed]);
  const studentId=claimed.rows.length?proposed:(await tx.query<{student_id:string}>('SELECT student_id FROM import_student_identities WHERE source=$1 AND source_student_id=$2',[row.source,studentKey])).rows[0].student_id;
  if(claimed.rows.length)await tx.query('INSERT INTO students(id,reference,name,guardian_contact,emergency_contact,created_at) VALUES($1,$2,$3,$4,$5,$6)',[studentId,`STU-${id().slice(0,12).toUpperCase()}`,d.name,d.guardianContact||'',d.emergencyContact||null,when(d.createdAt)]);
  else if(!(await tx.query('SELECT id FROM students WHERE id=$1 AND trashed_at IS NULL AND NOT purging FOR UPDATE',[studentId])).rows.length)throw new AppError(409,'Historical identity is deleted or unavailable; reconcile it manually.');
  const participationId=id(),snapshot={studentName:d.name,school:{id:school.id,reference:school.reference,name:school.name,city:school.city,state:school.state},class:Number(d.class),section:d.section||'',coordinator:d.coordinator||'',import:{source:row.source,sourceId:row.source_id,originalReference:d.originalReference||null,dateKnown:!!d.createdAt,consentVerified:false}};
  await tx.query('INSERT INTO school_participations(id,school_id,edition_id,snapshot) VALUES($1,$2,$3,$4) ON CONFLICT(school_id,edition_id) DO NOTHING',[id(),school.id,row.payload.editionId,JSON.stringify(snapshot.school)]);
  const saved=await tx.query('INSERT INTO student_participations(id,student_id,school_id,edition_id,class,section,coordinator,snapshot,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(student_id,edition_id) DO NOTHING RETURNING id',[participationId,studentId,school.id,row.payload.editionId,Number(d.class),String(d.section||''),String(d.coordinator||''),JSON.stringify(snapshot),when(d.createdAt)]);
  if(!saved.rows.length)throw new AppError(409,'This reviewed source student already has a participation for the edition; reconcile the duplicate source row.');
  return {entityId:participationId,missingFiles:0};
}
async function importSubmission(tx:Db,actor:Actor,row:Stored){
  const d=row.payload.data;
  const participation=(await tx.query(`SELECT p.* FROM import_rows i JOIN student_participations p ON p.id=i.entity_id WHERE i.source=$1 AND i.source_id=$2 AND i.kind='participations' AND i.status='imported' FOR SHARE OF p`,[row.source,d.participationSourceId])).rows[0];
  const competition=(await tx.query('SELECT * FROM competitions WHERE id=$1 FOR SHARE',[d.competitionId])).rows[0];
  const submissionId=id(),answers=d.answers||{},submittedAt=d.submittedAt?new Date(d.submittedAt):null;
  await tx.query("INSERT INTO submissions(id,reference,student_participation_id,competition_id,category_id,state,revision,answers,submitted_at) VALUES($1,$2,$3,$4,$5,'draft',1,$6,$7)",[submissionId,`ENT-${id().slice(0,12).toUpperCase()}`,participation.id,competition.id,d.categoryId,JSON.stringify(answers),submittedAt]);
  await tx.query('INSERT INTO submission_revisions(id,submission_id,version,answers,context,asset_ids,config,submitted_by,created_at) VALUES($1,$2,1,$3,$4,$5,$6,$7,$8)',[id(),submissionId,JSON.stringify(answers),JSON.stringify({...participation.snapshot,import:{source:row.source,sourceId:row.source_id,retentionVerified:false}}),'[]',JSON.stringify(competition.config),actor.id,submittedAt||new Date()]);
  const references=[...new Set<string>(d.fileReferences||[])];
  const requiredFiles=competition.config?.files?.minCount??0;
  if(!Number.isSafeInteger(requiredFiles)||requiredFiles<0)throw new AppError(409,'Historical file requirements are invalid.');
  for(let number=1;references.length<requiredFiles;number++)references.push(`unknown-source:${number}`);
  await tx.query('INSERT INTO imported_submission_history(submission_id,import_row_id,original_reference,original_state,original_submitted_at,retention_status) VALUES($1,$2,$3,$4,$5,$6)',[submissionId,row.id,d.originalReference||null,String(d.originalState||'unknown').slice(0,100),submittedAt,references.length?'missing':'unverified']);
  for(const url of references)await tx.query('INSERT INTO historical_file_refs(id,submission_id,source_url) VALUES($1,$2,$3)',[id(),submissionId,url]);
  return {entityId:submissionId,missingFiles:references.length};
}

export async function commitImport(db:Db,actor:Actor,input:unknown){
  requireAdmin(actor);
  const parsed=z.object({reviewed:z.literal(true),rows:z.array(z.object({id:z.uuid(),version:z.uuid()})).min(1).max(500)}).safeParse(input);
  if(!parsed.success)throw new AppError(400,'Confirm review and supply selected preview row IDs and versions.');
  const output:{id:string;status:string;entityId?:string;error?:string;missingFiles?:number}[]=[];
  for(const selected of parsed.data.rows){
    try{
      const result=await db.transaction(async tx=>{
        const row=(await tx.query<Stored>('SELECT * FROM import_rows WHERE id=$1 FOR UPDATE',[selected.id])).rows[0];
        if(!row)throw new AppError(404,'Preview row not found.');
        if(row.status==='purged')throw new AppError(409,'This source record was permanently deleted and cannot be re-imported.');
        if(row.status==='imported')return {id:row.id,status:'duplicate',entityId:row.entity_id!};
        if(row.preview_version!==selected.version)throw new AppError(409,'Preview changed. Review its latest version before committing.');
        const checked=await inspect(tx,row);if(checked.issues.length)throw new AppError(422,checked.issues.join(' '));
        const imported=row.kind==='schools'?await importSchool(tx,row):row.kind==='participations'?await importParticipation(tx,row):await importSubmission(tx,actor,row);
        await tx.query("UPDATE import_rows SET status='imported',entity_id=$2,payload=$3,error=NULL,updated_at=now() WHERE id=$1",[row.id,imported.entityId,JSON.stringify({summary:{sourceId:row.source_id,kind:row.kind,originalReference:row.payload.data.originalReference||null,sourceRegisteredAt:row.kind==='schools'?row.payload.data.registeredAt??null:undefined,schoolMatch:row.payload.schoolMatch||null,importedAt:new Date().toISOString(),missingFiles:imported.missingFiles}})]);
        await audit(tx,actor,'import.commit',row.kind,imported.entityId,{source:row.source,sourceId:row.source_id,rowId:row.id,missingFiles:imported.missingFiles});
        return {id:row.id,status:'imported',entityId:imported.entityId,missingFiles:imported.missingFiles};
      });
      output.push(result);
    }catch(error){
      const message=error instanceof AppError?error.message:'Import failed. Review this row and database diagnostics before retrying.';
      await db.query("UPDATE import_rows SET error=$2,updated_at=now() WHERE id=$1 AND status NOT IN ('imported','purged') AND preview_version=$3",[selected.id,message,selected.version]);
      output.push({id:selected.id,status:'error',error:message});
    }
  }
  return {rows:output,imported:output.filter(r=>r.status==='imported').length,duplicates:output.filter(r=>r.status==='duplicate').length,errors:output.filter(r=>r.status==='error').length,missingFiles:output.reduce((n,r)=>n+(r.missingFiles||0),0)};
}
