import { pathToFileURL } from 'node:url';
import { db, type Db } from '../src/server/db';
import { id } from '../src/server/core';
import { competitionSchema, fileRoleSchema } from '../src/domain/rules';
import { competitionGuidelines2027, guidelines2027Source, type CompetitionGuideline2027 } from '../src/data/guidelines-2027';
import { validateLocalEnvironment } from './local-config.mjs';

const importKey='yes-2027-ai-deduction-confirmed-v4';
const editionLabel='Youth Eco Summit 2027';
function revisionFor(item:CompetitionGuideline2027){
  const aiDecision='User confirmed a 15-point deduction for AI-generated submission content. Research and reference use is allowed; earlier disqualification wording is superseded for this version.';
  const craftDecision=' User also confirmed Waste to Art eligibility for all four bands: Classes 5–6, 7–8, 9–10 and 11–12.';
  return {version:4,importKey,userDecision:aiDecision+(item.slug==='waste-to-art'?craftDecision:'')};
}
export function compileGuideline(item:CompetitionGuideline2027){
  const fields:any[]=[{key:'title',label:'Project title',type:'text',required:true,maxLength:200,step:'details',description:'Use your own project title. We add the school, class, competition and author names to the final submission label.'}];
  const topicGroups=item.classTopics.filter(group=>group.classes.some(c=>item.classes.includes(c)));
  if(topicGroups.length)fields.push({key:'topic',label:'Choose your topic',type:'select',required:true,step:'details',options:[...new Set(topicGroups.flatMap(g=>g.topics.map(t=>t.title)))],optionsByClass:topicGroups.map(g=>({classes:g.classes.filter(c=>item.classes.includes(c)),options:g.topics.map(t=>t.title)}))});
  if(item.languages.length)fields.push({key:'language',label:'Language of your entry',type:'select',required:true,step:'details',options:item.languages});
  if(item.category==='Art & expression')fields.push({key:'tagline',label:'What is the message behind your artwork?',type:'text',required:true,maxLength:500,step:'details',description:'Write a short sentence or tagline.'});
  fields.push({key:'originality',label:'We take responsibility for this submission and the originality of our contribution. We understand that AI-generated submission content receives a 15-point deduction. AI use for research or reference is permitted.',type:'checkbox',required:true,step:'declarations'});
  fields.push({key:'citations',label:'We have credited all external sources used or drawn on in this submission.',type:'checkbox',required:true,step:'declarations'});
  if(item.fileRequirements.some(f=>f.captionsRequired))fields.push({key:'captions',label:'The required videos include closed captions.',type:'checkbox',required:true,step:'declarations'});
  if(item.slug==='waste-to-art')fields.push({key:'supervision',label:'At least 50% of the model uses e-waste. We created it safely under teacher supervision.',type:'checkbox',required:true,step:'declarations'});
  if(item.wordRange)fields.push({key:'typed_work',label:'The PDF is typed, includes an author byline and follows the required title, introduction, body, conclusion and references structure.',type:'checkbox',required:true,step:'declarations'});
  const roles=item.fileRequirements.map(file=>fileRoleSchema.parse({id:file.role.replaceAll('-','_'),label:file.title,minCount:file.required?1:0,maxCount:1,maxBytes:file.maxBytes,types:file.types,maxDurationSeconds:file.duration?.maxSeconds,orientation:file.orientation,maxHeight:file.maxHeight,...(item.wordRange&&file.types.includes('application/pdf')&&file.required?{minWords:item.wordRange.min,maxWords:item.wordRange.max}:{})}));
  const categories=[[5,6],[7,8],[9,10],[11,12]].map(band=>band.filter(c=>item.classes.includes(c))).filter(band=>band.length).map(classes=>({id:`classes_${classes.join('_')}`,label:`Classes ${classes.join('–')}`,classes}));
  const config={
    naming:'school_class_category_project_authors',mode:item.team.allowed?'team':'individual',entryLimit:item.entryLimit,minMembers:1,maxMembers:item.team.maxMembers,
    categories,fields,files:{minCount:roles.reduce((n,r)=>n+r.minCount,0),maxCount:roles.length,maxBytes:Math.max(...roles.map(r=>r.maxBytes)),maxTotalBytes:roles.reduce((n,r)=>n+r.maxBytes,0),types:[...new Set(roles.flatMap(r=>r.types))],roles},
    provenance:{...revisionFor(item),source:guidelines2027Source.filename,sourcePath:guidelines2027Source.href,targetEdition:2027},
    reviewRequired:['competition_dates','registration_dates_and_consent',...(item.team.allowed?['team_school_policy','team_class_policy']:[]),...(item.eligibilityPending?['craft_class_eligibility']:[]),...(item.slug==='eco-business-model'?['organizer_slide_template']:[])],
    aiPolicy:guidelines2027Source.aiPolicy,guidelineRubric:item.rubric,sourceClarifications:guidelines2027Source.clarificationItems,
  };
  // Missing team policy or disputed classes deliberately prevents approval. No rule is invented.
  if(!item.team.allowed&&!item.eligibilityPending)competitionSchema.parse(config);
  else competitionSchema.parse({...config,mode:'individual',minMembers:1,maxMembers:1,categories:categories.length?categories:[{id:'validation_only',label:'Schema validation only; never persisted',classes:[1]}]});
  return config;
}
export async function import2027Guidelines(database:Db){
 return database.transaction(async tx=>{
  await tx.query('LOCK TABLE editions, competitions IN SHARE ROW EXCLUSIVE MODE');
  const {rows:editions}=await tx.query('SELECT * FROM editions WHERE label=$1',[editionLabel]);
  if(editions.length>1)throw new Error('Multiple 2027 editions found; no records changed.');
  let edition=editions[0];let editionCreated=false;
  if(!edition){[edition]=(await tx.query("INSERT INTO editions(id,label,state,config) VALUES($1,$2,'draft',$3) RETURNING *",[id(),editionLabel,JSON.stringify({registrationApproved:false,provenance:{importKey,source:guidelines2027Source.filename}})])).rows;editionCreated=true;}
  const createdIds:string[]=[];
  for(const item of competitionGuidelines2027){
   const revision=revisionFor(item);
   const {rows:existing}=await tx.query('SELECT id,config FROM competitions WHERE edition_id=$1 AND slug=$2 AND version=$3',[edition.id,item.slug,revision.version]);
   if(existing[0]){if(existing[0].config?.provenance?.importKey!==revision.importKey)throw new Error(`A different version ${revision.version} already exists for ${item.slug}; no records changed.`);continue;}
   const config=compileGuideline(item);
   const guidelines=[item.description,...guidelines2027Source.generalRules,...item.notes,...item.classTopics.flatMap(g=>g.topics.map(t=>`${t.title}: ${t.prompt}`))].join('\n\n');
   const inserted=id();await tx.query("INSERT INTO competitions(id,edition_id,slug,title,guidelines,status,opens_at,closes_at,version,config) VALUES($1,$2,$3,$4,$5,'draft',NULL,NULL,$6,$7)",[inserted,edition.id,item.slug,item.title,guidelines,revision.version,JSON.stringify(config)]);createdIds.push(inserted);
  }
  if(editionCreated||createdIds.length)await tx.query('INSERT INTO audit_events(id,action,entity_type,entity_id,detail) VALUES($1,$2,$3,$4,$5)',[id(),'programme.import_guidelines','editions',edition.id,JSON.stringify({importKey,editionCreated,createdCompetitionIds:createdIds,formatVersions:competitionGuidelines2027.map(item=>({slug:item.slug,...revisionFor(item)})),source:guidelines2027Source.filename})]);
  return {editionId:edition.id,created:createdIds.length,preserved:competitionGuidelines2027.length-createdIds.length,editionCreated};
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{validateLocalEnvironment(process.env);console.log(JSON.stringify({...await import2027Guidelines(db),message:'Version 4 drafts for all ten formats record the confirmed 15-point AI deduction. Prior versions, programme dates, consent and approval state were preserved.'},null,2));process.exit(0);}
 catch(error){console.error(error instanceof Error&&!('code' in error)?error.message:'Guideline import failed. Check local services and migrations.');process.exit(1);}
}
