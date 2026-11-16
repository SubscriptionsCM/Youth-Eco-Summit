import {z} from 'zod';
import {competitionGuidelines2027} from '../data/guidelines-2027';
import {AppError} from '../server/core';

export const judgingCatalogue=competitionGuidelines2027.map(g=>({key:g.slug,title:g.title,edition:'2027',description:g.description,notes:g.notes,rubric:{
 criteria:g.rubric.criteria.map((c,i)=>({id:`criterion_${i+1}`,title:c.title,max:c.marks})),
 penalties:g.rubric.penalties.map((p,i)=>({id:`penalty_${i+1}`,title:p.title,marks:p.marks})),total:g.rubric.total,notes:g.rubric.notes,
}}));
export const judgingRubricSchema=z.object({criteria:z.array(z.object({id:z.string(),title:z.string(),max:z.number().positive()})).min(1),penalties:z.array(z.object({id:z.string(),title:z.string(),marks:z.number().negative()})),total:z.number().positive(),notes:z.array(z.string())});
export type JudgingRubric=z.infer<typeof judgingRubricSchema>;
export const judgingReviewSchema=z.object({scores:z.record(z.string(),z.number().finite()).default({}),deductions:z.array(z.string()).max(20).default([]),comment:z.string().max(10000).default(''),flag:z.enum(['','conflict','unreadable','other']).default(''),lockVersion:z.number().int().min(0)}).strict();
export function judgingTotal(rubric:JudgingRubric,input:z.infer<typeof judgingReviewSchema>,final:boolean){
 const allowed=new Set(rubric.criteria.map(c=>c.id));
 if(Object.keys(input.scores).some(k=>!allowed.has(k)))throw new AppError(422,'A score does not belong to this rubric.');
 for(const criterion of rubric.criteria){const value=input.scores[criterion.id];if(value===undefined){if(final)throw new AppError(422,'Score every criterion before submitting.');}else if(value<0||value>criterion.max)throw new AppError(422,`${criterion.title} must be between 0 and ${criterion.max}.`);}
 if(new Set(input.deductions).size!==input.deductions.length||input.deductions.some(id=>!rubric.penalties.some(p=>p.id===id)))throw new AppError(422,'Choose only deductions listed in this rubric.');
 if((final||input.flag)&&!input.comment.trim())throw new AppError(422,'Add review comments before continuing.');
 // Preserve source marks and penalties. No normalization, clamping or automatic winner selection.
 return Math.round((Object.values(input.scores).reduce((a,b)=>a+b,0)+input.deductions.reduce((n,id)=>n+rubric.penalties.find(p=>p.id===id)!.marks,0))*100)/100;
}
export const judgingFieldIds=new Set(['select-yes-class','select-yes-topic','select-yes-language','radio-yes-entry-mode','number-yes-team-size','number-yes-word-count']);
