import { z } from 'zod';
import { AppError } from '../server/core';
const key = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);
const fieldSchema = z.object({
  key, label:z.string().min(1).max(1000), type:z.enum(['text','textarea','number','select','checkbox']), required:z.boolean(),
  description:z.string().max(3000).optional(), step:z.enum(['details','declarations']).optional(),
  options:z.array(z.string().max(1000)).optional(),
  optionsByClass:z.array(z.object({classes:z.array(z.number().int().min(1).max(12)).min(1),options:z.array(z.string().max(1000)).min(1)})).optional(),
  min:z.number().optional(),max:z.number().optional(),maxLength:z.number().int().positive().max(100000).optional(),
  minWords:z.number().int().min(1).optional(),maxWords:z.number().int().min(1).optional(),
});
const mediaConstraints = {
  maxDurationSeconds:z.number().positive().optional(),maxHeight:z.number().int().positive().optional(),
  orientation:z.enum(['landscape','landscape-or-portrait']).optional(),
};
const mimeTypes = z.array(z.string().regex(/^[\w.+-]+\/[\w.+-]+$/)).min(1);
export const fileRoleSchema = z.object({id:key,label:z.string().min(1).max(200),minCount:z.number().int().min(0).max(30),maxCount:z.number().int().min(1).max(30),maxBytes:z.number().int().positive().max(53687091200),types:mimeTypes,minWords:z.number().int().positive().optional(),maxWords:z.number().int().positive().optional(),...mediaConstraints});
export const competitionSchema = z.object({
  naming:z.literal('school_class_category_project_authors').optional(),
  mode:z.enum(['individual','team']),teamSchoolPolicy:z.enum(['same_school','any_registered_school']).optional(),teamClassPolicy:z.enum(['same_category','lead_category']).optional(),entryLimit:z.number().int().min(1).nullable(),minMembers:z.number().int().min(1).max(100),maxMembers:z.number().int().min(1).max(100),
  categories:z.array(z.object({id:key,label:z.string().min(1),classes:z.array(z.number().int().min(1).max(12)).min(1)})).min(1),
  fields:z.array(fieldSchema).max(100),files:z.object({minCount:z.number().int().min(0).max(30),maxCount:z.number().int().min(0).max(30),maxBytes:z.number().int().positive().max(53687091200),types:mimeTypes,...mediaConstraints,maxTotalBytes:z.number().int().positive().optional(),roles:z.array(fileRoleSchema).min(1).max(30).optional()})
}).superRefine((v,ctx)=>{
  const fail=(message:string)=>ctx.addIssue({code:'custom',message});
  const classes=v.categories.flatMap(c=>c.classes);
  if(new Set(classes).size!==classes.length) fail('Class categories must not overlap.');
  if(new Set(v.categories.map(c=>c.id)).size!==v.categories.length) fail('Category IDs must be unique.');
  if(new Set(v.fields.map(f=>f.key)).size!==v.fields.length) fail('Field keys must be unique.');
  if(v.minMembers>v.maxMembers||(v.mode==='individual'&&(v.minMembers!==1||v.maxMembers!==1))) fail('Invalid team member limits.');
  if(v.mode==='team'&&(!v.teamSchoolPolicy||!v.teamClassPolicy))fail('Team competitions require explicit school and category policies.');
  if(v.files.minCount>v.files.maxCount) fail('Invalid file count limits.');
  if(v.files.roles){
    if(new Set(v.files.roles.map(r=>r.id)).size!==v.files.roles.length)fail('File role IDs must be unique.');
    if(v.files.roles.some(r=>r.minCount>r.maxCount||r.maxBytes>v.files.maxBytes||(r.minWords!==undefined&&r.maxWords!==undefined&&r.minWords>r.maxWords)||r.types.some(t=>!v.files.types.includes(t))))fail('File role requirements exceed the overall file policy.');
    if(v.files.roles.reduce((n,r)=>n+r.minCount,0)!==v.files.minCount||v.files.roles.reduce((n,r)=>n+r.maxCount,0)!==v.files.maxCount)fail('Overall file counts must match the required roles.');
  }
  if(v.fields.some(f=>f.type==='select'&&!f.options?.length)) fail('Select fields require options.');
  if(v.fields.some(f=>f.min!==undefined&&f.max!==undefined&&f.min>f.max)) fail('Field minimum exceeds maximum.');
  if(v.fields.some(f=>f.minWords!==undefined&&f.maxWords!==undefined&&f.minWords>f.maxWords))fail('Word minimum exceeds maximum.');
  if(v.fields.some(f=>f.optionsByClass?.some(group=>group.options.some(option=>!f.options?.includes(option)))))fail('Class-specific options must belong to the field options.');
});
export type CompetitionConfig=z.infer<typeof competitionSchema>;
export const rubricSchema=z.object({criteria:z.array(z.object({id:key,label:z.string().min(1),min:z.number(),max:z.number(),weight:z.number().positive().default(1),required:z.boolean().default(true)})).min(1),commentRequired:z.boolean()}).superRefine((v,c)=>{
  if(new Set(v.criteria.map(x=>x.id)).size!==v.criteria.length||v.criteria.some(x=>x.min>=x.max)) c.addIssue({code:'custom',message:'Rubric IDs must be unique and ranges valid.'});
});
export type Rubric=z.infer<typeof rubricSchema>;
export function categoryFor(categories:CompetitionConfig['categories'],classNumber:number) { const found=categories.filter(c=>c.classes.includes(classNumber)); if(found.length!==1) throw new AppError(422,'This class is not eligible for the competition.'); return found[0].id; }
export function wordCount(value:string){return value.trim().split(/\s+/u).filter(Boolean).length;}
export function validateAnswers(fields:CompetitionConfig['fields'],answers:Record<string,unknown>,final:boolean,classNumber?:number) {
  if(Object.keys(answers).some(k=>!fields.some(f=>f.key===k))) throw new AppError(422,'An answer does not belong to this form version.');
  for(const f of fields){ const value=answers[f.key]; const absent=value===undefined||value===null||value==='';
    if(absent){if(final&&f.required) throw new AppError(422,`${f.label} is required.`);continue;}
    if(f.type==='checkbox'){if(typeof value!=='boolean'||(final&&f.required&&!value)) throw new AppError(422,`${f.label} must be accepted.`);}
    else if(f.type==='number'){if(typeof value!=='number'||!Number.isFinite(value)||(f.min!==undefined&&value<f.min)||(f.max!==undefined&&value>f.max)) throw new AppError(422,`${f.label} is outside the allowed range.`);}
    else {
      if(typeof value!=='string'||value.length>(f.maxLength??10000)||(final&&f.required&&!value.trim())||(f.type==='select'&&!f.options?.includes(value))) throw new AppError(422,`${f.label} is invalid.`);
      if(f.optionsByClass&&(classNumber===undefined||!f.optionsByClass.some(group=>group.classes.includes(classNumber)&&group.options.includes(value))))throw new AppError(422,`${f.label} is not available for the registered class.`);
      const words=wordCount(value);
      if(final&&((f.minWords!==undefined&&words<f.minWords)||(f.maxWords!==undefined&&words>f.maxWords)))throw new AppError(422,`${f.label} must contain ${f.minWords??0}–${f.maxWords??'unlimited'} words (currently ${words}).`);
    }
  }
  return answers;
}
export function validateScores(rubric:Rubric,scores:Record<string,number>,comment:string,final:boolean){
  if(Object.keys(scores).some(k=>!rubric.criteria.some(c=>c.id===k))) throw new AppError(422,'Unknown scoring criterion.');
  for(const c of rubric.criteria){const score=scores[c.id];if(score===undefined){if(final&&c.required)throw new AppError(422,`${c.label} is required.`);}else if(typeof score!=='number'||!Number.isFinite(score)||score<c.min||score>c.max)throw new AppError(422,`${c.label} is outside the allowed range.`);}
  if(final&&rubric.commentRequired&&!comment.trim()) throw new AppError(422,'A review comment is required.');
  return scores;
}
export function nextState(from:string,to:string,kind:string,reason:string,juryReference:string){
  const transitions:Record<string,string[]>={submitted:['longlisted','disqualified'],longlisted:['shortlisted','not_selected','disqualified'],shortlisted:['finalized','not_selected']};
  if(!reason.trim()||!transitions[from]?.includes(to))throw new AppError(422,'This workflow transition is not allowed or requires a reason.');
  if(from==='submitted'&&kind!=='screening')throw new AppError(422,'Guideline screening is required.');
  if(['shortlisted','finalized','not_selected'].includes(to)&&(kind!=='jury'||!juryReference.trim()))throw new AppError(422,'Record an authorized jury decision reference.');
  return to;
}
export function csvCell(value:unknown){let text=value==null?'':String(value);if(/^[\s]*[=+@-]/.test(text)||/^[\t\r\n]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}
export const phone=z.string().trim().regex(/^\+[1-9]\d{7,14}$/,'Use an international phone number, for example +919876543210.');
export const schoolSchema=z.object({name:z.string().trim().min(2).max(200),address:z.string().trim().min(5).max(1000),city:z.string().trim().min(2).max(100),state:z.string().trim().min(2).max(100),postalCode:z.string().trim().min(3).max(20),contactName:z.string().trim().min(2).max(150),contactRole:z.string().trim().min(2).max(100),email:z.email(),phone,coordinator:z.string().max(200).optional()});
