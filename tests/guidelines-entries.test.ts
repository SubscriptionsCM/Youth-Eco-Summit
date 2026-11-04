import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { competitionGuidelines2027 } from '../src/data/guidelines-2027';
import { competitionSchema, validateAnswers } from '../src/domain/rules';
import { compileGuideline, import2027Guidelines } from '../scripts/import-2027-guidelines';
import { import2027CompetitionDrafts } from '../scripts/import-2027-competition-drafts';
import { inspectFileMetadata, rulesForRole, submissionLabel, validateFileSelection, validateMetadata } from '../src/server/storage/validation';
import { createEntry, entryDetail, submitEntry, updateEntry } from '../src/server/entries';
import { storageAction } from '../src/server/storage';
import { db as liveDb } from '../src/server/db';
import * as provider from '../src/server/storage/provider';
import { id, type Actor } from '../src/server/core';
import { testDb } from './helpers/db';
const guideline=(slug:string)=>competitionGuidelines2027.find(item=>item.slug===slug)!;
const config=(slug:string)=>compileGuideline(guideline(slug));
const roles=(slug:string)=>config(slug).files;
const asset=(role:string,mime:string,bytes:number,metadata={})=>({role,mime_type:mime,byte_size:bytes,status:'ready',metadata});

describe('2027 rules compiled from the supplied source',()=>{
 it('keeps ten formats, unlimited entries, individual-or-team participation and unresolved policies',()=>{
  expect(competitionGuidelines2027).toHaveLength(10);
  for(const item of competitionGuidelines2027){const compiled=compileGuideline(item);expect(compiled.entryLimit).toBeNull();expect(compiled.minMembers).toBe(1);if(item.team.allowed){expect(compiled.maxMembers).toBe(item.team.maxMembers);expect(competitionSchema.safeParse(compiled).success).toBe(false);}else expect(competitionSchema.safeParse(compiled).success).toBe(true);}
  expect(config('waste-to-art').categories.flatMap(c=>c.classes)).toEqual([5,6,7,8,9,10,11,12]);
  expect(config('waste-to-art').reviewRequired).not.toContain('craft_class_eligibility');
  expect(config('waste-to-art').provenance.version).toBe(4);
  expect(config('spoken-word').maxMembers).toBe(2);
 });
 it('acknowledges the confirmed AI deduction without requiring a no-AI declaration',()=>{
  for(const item of competitionGuidelines2027){
   const compiled=compileGuideline(item),declaration=compiled.fields.find(field=>field.key==='originality');
   expect(compiled.provenance.version).toBe(4);expect(compiled.provenance.importKey).toBe('yes-2027-ai-deduction-confirmed-v4');
   expect(compiled.aiPolicy).toMatchObject({treatment:'deduction',penaltyPoints:15,researchReferenceAllowed:true,confirmedBy:'user'});
   expect(declaration.required).toBe(true);expect(declaration.label).toContain('take responsibility');expect(declaration.label).toContain('15-point deduction');
   expect(declaration.label).not.toMatch(/contains no AI|no AI-generated|only for research|disqualif/i);
   expect(()=>validateAnswers([declaration],{originality:true},true,item.classes[0])).not.toThrow();
   expect(()=>validateAnswers([declaration],{originality:false},true,item.classes[0])).toThrow('accepted');
   const aiPenalties=compiled.guidelineRubric.penalties.filter(p=>p.title.startsWith('AI-generated'));
   expect(aiPenalties).toHaveLength(1);expect(aiPenalties[0].marks).toBe(-15);
   expect(aiPenalties[0].title).toBe(['painting','digital-art'].includes(item.slug)?'AI-generated or copied submission content':'AI-generated submission content');
  }
 });
 it('restricts topics to the registered class, retains partial answers and requires final declarations',()=>{
  const c=config('short-film-making'),answer={title:'My film',topic:c.fields.find(f=>f.key==='topic')!.options[0],language:'English',originality:true,citations:true};
  expect(()=>validateAnswers(c.fields,answer,true,7)).not.toThrow();
  expect(()=>validateAnswers(c.fields,answer,true,11)).toThrow('registered class');
  expect(()=>validateAnswers(c.fields,{title:'Work in progress'},false,7)).not.toThrow();
  expect(()=>validateAnswers(c.fields,{...answer,originality:false},true,7)).toThrow('accepted');
  expect(()=>validateAnswers(c.fields,{...answer,current_step:'review'},false,7)).toThrow('form version');
 });
 it('requires the right file in every role, including both eco-business parts',()=>{
  const files=roles('eco-business-model');
  expect(()=>validateFileSelection(files,[asset('presentation','application/pdf',2*1048576),asset('business_explanation','video/mp4',50*1048576,{durationSeconds:60})],true)).not.toThrow();
  expect(()=>validateFileSelection(files,[asset('presentation','application/pdf',100)],true)).toThrow();
  expect(()=>validateFileSelection(files,[asset('presentation','application/pdf',100),asset('presentation','application/pdf',100)],true)).toThrow();
  expect(()=>validateFileSelection(files,[asset('presentation','video/mp4',100),asset('business_explanation','video/mp4',100,{durationSeconds:10})],true)).toThrow('verification');
  expect(()=>validateFileSelection(files,[asset('presentation','application/pdf',2*1048576+1),asset('business_explanation','video/mp4',100,{durationSeconds:10})],true)).toThrow('size');
 });
 it('enforces craft’s two distinct videos, per-file 25 MB and 30/60 second limits; transcript stays optional',()=>{
  const files=roles('waste-to-art'),model=files.roles[0],explanation=files.roles[1];
  const uploads=[asset(model.id,'video/mp4',25*1048576,{durationSeconds:30,width:1920,height:1080}),asset(explanation.id,'video/mp4',25*1048576,{durationSeconds:60,width:1920,height:1080})];
  expect(()=>validateFileSelection(files,uploads,true)).not.toThrow();
  expect(()=>validateFileSelection(files,[...uploads,asset('transcript','application/pdf',1048576)],true)).not.toThrow();
  expect(()=>validateFileSelection(files,[{...uploads[0],byte_size:25*1048576+1},uploads[1]],true)).toThrow('size');
  expect(()=>validateFileSelection(files,[{...uploads[0],metadata:{durationSeconds:31,width:1920,height:1080}},uploads[1]],true)).toThrow('30-second');
  expect(()=>rulesForRole(files,'unknown')).toThrow('purpose');
 });
 it('checks word-count boundaries, resolution and orientation using verified metadata',()=>{
  const written=rulesForRole(roles('open-letter'),'written_piece');
  for(const wordCount of [500,600])expect(()=>validateMetadata({wordCount},written,'application/pdf')).not.toThrow();
  for(const wordCount of [0,499,601])expect(()=>validateMetadata({wordCount},written,'application/pdf')).toThrow();
  const art=rulesForRole(roles('painting'),'artwork');
  expect(()=>validateMetadata({width:1920,height:1080},art,'image/jpeg')).not.toThrow();
  expect(()=>validateMetadata({width:1080,height:1920},art,'image/jpeg')).toThrow('landscape');
  expect(()=>validateMetadata({width:1921,height:1080},art,'image/jpeg')).toThrow('Resolution');
  const film=rulesForRole(roles('short-film-making'),'short_film');
  expect(()=>validateMetadata({width:1080,height:1920,durationSeconds:300},film,'video/mp4')).not.toThrow();
  expect(()=>validateMetadata({width:1080,height:1920,durationSeconds:300.1},film,'video/mp4')).toThrow('300-second');
 });
 it('generates labels from real names while keeping Hindi letters and removing punctuation',()=>{
  expect(submissionLabel(['School Name','5A','Painting','जल जीवन','एकता शर्मा'])).toBe('School_Name_5A_Painting_जल_जीवन_एकता_शर्मा');
  expect(()=>submissionLabel(['School','5','Art','','Student'])).toThrow('required');
 });
});

describe('durable guideline entries and import safety',()=>{
 let store:Awaited<ReturnType<typeof testDb>>,parent:Actor,stranger:Actor,edition:string,school:string,student:string,participation:string,competition:string;
 const makeAnswers=()=>({title:'A cleaner tomorrow',topic:guideline('open-letter').classTopics[0].topics[0].title,language:'English',originality:true,citations:true,typed_work:true});
 beforeAll(async()=>{
  store=await testDb();parent={id:id(),role:'participant'};stranger={id:id(),role:'participant'};edition=id();school=id();student=id();participation=id();competition=id();
  for(const actor of [parent,stranger])await store.db.query("INSERT INTO users(id,role,contact) VALUES($1,'participant',$2)",[actor.id,actor.id]);
  await store.db.query("INSERT INTO editions(id,label,state) VALUES($1,'Guideline tests','open')",[edition]);
  await store.db.query("INSERT INTO schools(id,reference,name,address,city,state,postal_code,status) VALUES($1::uuid,$1::text,'Green School','Road','Delhi','Delhi','110001','active')",[school]);
  await store.db.query("INSERT INTO students(id,reference,name,guardian_contact) VALUES($1::uuid,$1::text,'एकता शर्मा','guardian')",[student]);
  await store.db.query('INSERT INTO participant_access(user_id,student_id) VALUES($1,$2)',[parent.id,student]);
  await store.db.query("INSERT INTO student_participations(id,student_id,school_id,edition_id,class,section,snapshot) VALUES($1,$2,$3,$4,5,'A',$5)",[participation,student,school,edition,JSON.stringify({studentName:'एकता शर्मा',school:{name:'Green School'}})]);
  await store.db.query("INSERT INTO competitions(id,edition_id,slug,title,guidelines,status,opens_at,closes_at,config) VALUES($1,$2,'open-letter','Open Letter','Supplied rules','approved',now()-interval '1 day',now()+interval '1 day',$3)",[competition,edition,JSON.stringify(config('open-letter'))]);
 });
 afterEach(()=>vi.restoreAllMocks());
 afterAll(async()=>await store?.close());
 it('saves and resumes each step without losing earlier answers and rejects stale or unauthorized writes',async()=>{
  const draft=await createEntry(store.db,parent,{participationId:participation,competitionId:competition,answers:{title:'First step'}});
  const saved=await updateEntry(store.db,parent,draft.id,{answers:makeAnswers(),currentStep:'upload',lockVersion:0});
  expect(saved.current_step).toBe('upload');expect(saved.lock_version).toBe(1);
  const loaded=await entryDetail(store.db,parent,draft.id);expect(loaded.entry.answers).toEqual(makeAnswers());expect(loaded.entry.current_step).toBe('upload');
  await expect(updateEntry(store.db,parent,draft.id,{answers:{title:'Stale'},currentStep:'details',lockVersion:0})).rejects.toThrow('another tab');
  await expect(updateEntry(store.db,stranger,draft.id,{answers:makeAnswers(),currentStep:'review',lockVersion:1})).rejects.toThrow('not found');
  await expect(submitEntry(store.db,parent,draft.id,1)).rejects.toThrow();
 });
 it('finalizes verified work once, generates filenames and allows another entry when limit is null',async()=>{
  for(let attempt=0;attempt<2;attempt++){
   const draft=await createEntry(store.db,parent,{participationId:participation,competitionId:competition,answers:makeAnswers()});
   await store.db.query("INSERT INTO assets(id,submission_id,revision,uploader_id,original_name,storage_key,mime_type,byte_size,checksum,expected_size,expected_checksum,part_size,status,role,metadata) VALUES($1,$2,1,$3,'my-document.pdf',$4,'application/pdf',100,$5,100,$5,8388608,'ready','written_piece',$6)",[id(),draft.id,parent.id,`submissions/${draft.id}/${id()}`,'a'.repeat(64),JSON.stringify({wordCount:550})]);
   const result=await submitEntry(store.db,parent,draft.id,0);expect(result.state).toBe('submitted');
   expect((await submitEntry(store.db,parent,draft.id,0)).reference).toBe(result.reference);
   const details=await entryDetail(store.db,parent,draft.id);expect(details.revisions).toHaveLength(1);expect(details.entry.submission_title).toBe('Green_School_5A_Open_Letter_A_cleaner_tomorrow_एकता_शर्मा');expect(details.assets[0].generated_name).toContain('एकता_शर्मा_written_piece.pdf');expect(details.assets[0].original_name).toBe('my-document.pdf');
  }
 });
 it('enforces file purpose and size at upload start before touching object storage',async()=>{
  const draft=await createEntry(store.db,parent,{participationId:participation,competitionId:competition});
  vi.spyOn(liveDb,'transaction').mockImplementation(fn=>store.db.transaction(fn));
  const begin=vi.fn(async()=> 'multipart');vi.spyOn(provider,'objectStore').mockReturnValue({begin} as any);
  const start=(body:Record<string,unknown>,actor=parent)=>storageAction(new Request('https://yes.test/api/uploads/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({submissionId:draft.id,originalName:'work.pdf',byteSize:100,checksum:'a'.repeat(64),...body})}),actor,['uploads','start']);
  await expect(start({role:'transcript'})).rejects.toThrow('purpose');
  await expect(start({role:'written_piece',byteSize:1048577})).rejects.toThrow('size');
  await expect(start({role:'written_piece'},stranger)).rejects.toThrow('not found');expect(begin).not.toHaveBeenCalled();
  expect((await start({role:'written_piece'}))!.status).toBe(201);
  await expect(start({role:'written_piece'})).rejects.toThrow();expect(begin).toHaveBeenCalledTimes(1);
 });
 it('imports ten AI-policy version-four drafts idempotently without changing versions one, two or three',async()=>{
  const original=await import2027CompetitionDrafts(store.db);
  for(const item of competitionGuidelines2027){
   const previous:any=compileGuideline(item);
   previous.provenance={version:2,importKey:'yes-2027-supplied-guidelines-v2',source:'Original supplied PDF'};
   previous.fields=previous.fields.map((field:any)=>field.key==='originality'?{...field,label:'This is our original work. It contains no AI-generated material.'}:field);
   delete previous.aiPolicy;
   if(item.slug==='waste-to-art'){previous.categories=[];previous.reviewRequired.push('craft_class_eligibility');}
   await store.db.query("INSERT INTO competitions(id,edition_id,slug,title,guidelines,status,opens_at,closes_at,version,config) VALUES($1,$2,$3,$4,'Original PDF wording: AI-generated content is disqualified','draft','2026-10-01T00:00:00+05:30','2026-11-06T00:00:00+05:30',2,$5)",[id(),original.editionId,item.slug,item.title,JSON.stringify(previous)]);
   if(item.slug==='waste-to-art'){
    const craft:any=compileGuideline(item);delete craft.aiPolicy;craft.fields=previous.fields;craft.provenance={version:3,importKey:'yes-2027-craft-classes-confirmed-v3',userDecision:'All four craft class bands confirmed'};
    await store.db.query("INSERT INTO competitions(id,edition_id,slug,title,guidelines,status,opens_at,closes_at,version,config) VALUES($1,$2,'waste-to-art','Waste to Art','Craft class confirmation; previous AI wording','draft',NULL,NULL,3,$3)",[id(),original.editionId,JSON.stringify(craft)]);
   }
  }
  const previousRows=(await store.db.query('SELECT * FROM competitions WHERE edition_id=$1 AND version<4 ORDER BY slug,version',[original.editionId])).rows;
  const editionBefore=(await store.db.query('SELECT * FROM editions WHERE id=$1',[original.editionId])).rows[0];
  const first=await import2027Guidelines(store.db),again=await import2027Guidelines(store.db);
  expect(first.created).toBe(10);expect(again.created).toBe(0);expect(again.preserved).toBe(10);
  expect((await store.db.query('SELECT * FROM competitions WHERE edition_id=$1 AND version<4 ORDER BY slug,version',[original.editionId])).rows).toEqual(previousRows);
  expect((await store.db.query('SELECT * FROM editions WHERE id=$1',[original.editionId])).rows[0]).toEqual(editionBefore);
  const next=(await store.db.query('SELECT * FROM competitions WHERE edition_id=$1 AND version=4',[original.editionId])).rows;
  expect(next).toHaveLength(10);expect(next.map(c=>c.slug).sort()).toEqual(competitionGuidelines2027.map(c=>c.slug).sort());
  for(const c of next){
   expect(c.status).toBe('draft');expect(c.opens_at).toBeNull();expect(c.closes_at).toBeNull();
   expect(c.config.provenance.importKey).toBe('yes-2027-ai-deduction-confirmed-v4');expect(c.config.provenance.source).toContain('2027');
   expect(c.config.aiPolicy).toMatchObject({penaltyPoints:15,treatment:'deduction',researchReferenceAllowed:true});
   expect(c.config.fields.find((field:any)=>field.key==='originality').label).toContain('15-point deduction');
   expect(c.guidelines).not.toMatch(/will be disqualified|contains no AI-generated/i);
  }
  const craft=next.find(c=>c.slug==='waste-to-art')!;expect(craft.config.provenance.userDecision).toContain('all four bands');expect(craft.config.categories.flatMap((c:any)=>c.classes)).toEqual([5,6,7,8,9,10,11,12]);
  expect((await store.db.query("SELECT id FROM audit_events WHERE entity_id=$1 AND action='programme.import_guidelines'",[original.editionId])).rows).toHaveLength(1);
 });
});

function pdfWithWords(count:number){
 const words=Array(count).fill('planet');const lines=[];for(let n=0;n<words.length;n+=12)lines.push(words.slice(n,n+12).join(' '));
 const stream=`BT /F1 10 Tf 40 790 Td 16 TL ${lines.map((line,n)=>`${n?'T* ':''}(${line}) Tj`).join('\n')} ET`;
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
 let document='%PDF-1.7\n';const offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(document));document+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
 const xref=Buffer.byteLength(document);document+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(document);
}
let textExtractorAvailable=true;try{execFileSync(process.env.PDFTOTEXT_PATH||'pdftotext',['-v'],{stdio:'ignore'});}catch{textExtractorAvailable=false;}
it.skipIf(!textExtractorAvailable)('extracts the actual retained PDF text instead of trusting declared word counts',async()=>{
 const rules=rulesForRole(roles('open-letter'),'written_piece');
 async function* content(bytes:Buffer){yield bytes;}
 expect(await inspectFileMetadata(content(pdfWithWords(500)),'application/pdf',rules)).toEqual({wordCount:500});
 await expect(inspectFileMetadata(content(pdfWithWords(499)),'application/pdf',rules)).rejects.toThrow('found 499');
});

let mediaInspectorAvailable=true;try{execFileSync(process.env.FFPROBE_PATH||'ffprobe',['-version'],{stdio:'ignore'});}catch{mediaInspectorAvailable=false;}
it.skipIf(!mediaInspectorAvailable)('reads actual raster dimensions with ffprobe',async()=>{
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=','base64');
 async function* bytes(){yield png;}
 expect(await inspectFileMetadata(bytes(),'image/png',{minCount:1,maxCount:1,maxBytes:10000,types:['image/png'],maxHeight:1080})).toEqual({width:1,height:1});
});
it('fails closed when a required inspection executable is missing',async()=>{
 vi.stubEnv('PDFTOTEXT_PATH','/missing-yes-pdftotext');
 try{async function* bytes(){yield pdfWithWords(500);}await expect(inspectFileMetadata(bytes(),'application/pdf',rulesForRole(roles('open-letter'),'written_piece'))).rejects.toThrow('not configured');}
 finally{vi.unstubAllEnvs();}
});
