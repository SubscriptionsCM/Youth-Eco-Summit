import { describe,it,expect } from 'vitest';
import { competitionSchema, validateAnswers, categoryFor, validateScores, csvCell, nextState } from '../src/domain/rules';
describe('competition and judging invariants',()=>{
  it('rejects ambiguous class categories and empty file policies',()=>{
    expect(competitionSchema.safeParse({mode:'individual',entryLimit:1,minMembers:1,maxMembers:1,categories:[{id:'a',label:'A',classes:[5]},{id:'b',label:'B',classes:[5]}],fields:[],files:{minCount:1,maxCount:1,maxBytes:100,types:[]}}).success).toBe(false);
  });
  it('derives eligibility from approved class rules instead of caller category',()=>{
    expect(categoryFor([{id:'junior',label:'Junior',classes:[3,4]}],4)).toBe('junior');
    expect(()=>categoryFor([{id:'junior',label:'Junior',classes:[3,4]}],8)).toThrow();
  });
  it('rejects missing fields, unknown answers, oversized and invalid choices',()=>{
    const fields=[{key:'title',label:'Title',type:'text' as const,required:true,maxLength:4},{key:'lang',label:'Language',type:'select' as const,required:true,options:['English']}];
    expect(()=>validateAnswers(fields,{title:'Hello',lang:'English'},true)).toThrow();
    expect(()=>validateAnswers(fields,{title:'Hi',lang:'French'},true)).toThrow();
    expect(()=>validateAnswers(fields,{title:'Hi',lang:'English',injected:'x'},true)).toThrow();
    expect(validateAnswers(fields,{title:'Hi',lang:'English'},true)).toEqual({title:'Hi',lang:'English'});
    expect(validateAnswers(fields,{},false)).toEqual({});
  });
  it('validates final scores and does not calculate winners',()=>{
    const rubric={criteria:[{id:'originality',label:'Originality',min:0,max:10,required:true,weight:1}],commentRequired:true};
    expect(()=>validateScores(rubric,{},'Good',true)).toThrow();
    expect(()=>validateScores(rubric,{originality:11},'Good',true)).toThrow();
    expect(()=>validateScores(rubric,{originality:8},'',true)).toThrow();
    expect(validateScores(rubric,{originality:8},'Good',true)).toEqual({originality:8});
  });
  it('enforces staged decisions and evidence for jury outcomes',()=>{
    expect(()=>nextState('submitted','finalized','jury','reason','minutes')).toThrow();
    expect(()=>nextState('longlisted','shortlisted','jury','reason','')).toThrow();
    expect(nextState('submitted','longlisted','screening','Meets guidelines','')).toBe('longlisted');
    expect(nextState('shortlisted','finalized','jury','Jury decision','minutes-1')).toBe('finalized');
  });
  it('escapes spreadsheet formulas and quoted multiline values',()=>{
    expect(csvCell('=HYPERLINK("bad")')).toBe('"\'=HYPERLINK(""bad"")"');
    expect(csvCell(' \t+cmd')).toBe('"\' \t+cmd"');
    expect(csvCell('School, A')).toBe('"School, A"');
  });
});
