import {describe,expect,it} from 'vitest';
import {referenceForms,validateReferenceAnswers,type ReferenceForm} from '../src/domain/wordpress-forms';
const contact=referenceForms.find(f=>f.key==='legacy-12146')!;
const check=(value:unknown,final=true)=>validateReferenceAnswers(contact,{'name-3':value},{final});
describe('native name and phone rules',()=>{
 it('requires each enabled contact name part even without an overall required flag',()=>{
  expect(check(undefined).errors).toHaveProperty('name-3');
  expect(check({'first-name':'Asha'}).errors).toHaveProperty('name-3');
  expect(check({'last-name':'Singh'}).errors).toHaveProperty('name-3');
  expect(check('Asha Singh').errors).toHaveProperty('name-3');
 });
 it('saves partial names and accepts complete names without retaining disabled or private parts',()=>{
  expect(check({'first-name':' Asha '},false).answers['name-3']).toEqual({'first-name':'Asha','last-name':''});
  const result=check({'first-name':' Asha ','last-name':' Singh ',prefix:'Dr',password:'NEVER KEEP'});
  expect(result.errors).not.toHaveProperty('name-3');expect(result.answers['name-3']).toEqual({'first-name':'Asha','last-name':'Singh'});
  expect(check({'first-name':{private:'bad'},'last-name':'Singh'}).errors).toHaveProperty('name-3');
 });
 const phone=(mode:unknown,value:string,extra={})=>validateReferenceAnswers({id:1,key:'qa',title:'QA',competition:false,settings:{},fields:[{id:'phone-1',type:'phone',validation:mode,...extra}]} as ReferenceForm,{'phone-1':value},{final:true});
 it('honors none and legacy-default modes instead of imposing an unrelated digit count',()=>{
  for(const mode of ['none',undefined])expect(phone(mode,'12345 ext 8').errors).not.toHaveProperty('phone-1');
 });
 it('uses native international punctuation and character bounds',()=>{
  expect(phone('international','+91 98765 43210').errors).not.toHaveProperty('phone-1');
  expect(phone('international','(91) 9876543210').errors).not.toHaveProperty('phone-1');
  for(const value of ['12345','123456789.0','++919876543210','123456789012345678901'])expect(phone('international',value).errors).toHaveProperty('phone-1');
  expect(phone('international','12345678901234567890').errors).not.toHaveProperty('phone-1');
 });
 it('enforces configured character limits including punctuation',()=>{
  expect(phone('character_limit','12345',{limit:5}).errors).not.toHaveProperty('phone-1');
  expect(phone('character_limit','123-45',{limit:5}).errors).toHaveProperty('phone-1');
  expect(phone('character_limit','abc',{limit:5}).errors).toHaveProperty('phone-1');
 });
});
