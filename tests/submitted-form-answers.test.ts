import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {SubmittedFormAnswers} from '../src/components/submitted-form-answers';
import type {ReferenceForm} from '../src/domain/wordpress-forms';
const form:ReferenceForm={id:1,key:'qa',title:'QA',competition:false,settings:{},fields:[{id:'text-1',type:'text',field_label:'Current label'}]};
describe('submitted form information',()=>{
 it('shows the immutable submitted schema and only its visible answers',()=>{
  const record={answers:{'text-1':'Original answer','select-1':'no','text-2':'Hidden value'},form_snapshot:{fields:[{id:'text-1',type:'text',field_label:'Submitted label'},{id:'text-2',type:'text',field_label:'Conditional field',conditions:[{element_id:'select-1',rule:'is',value:'yes'}]}]}};
  const html=renderToStaticMarkup(createElement(SubmittedFormAnswers,{form,record}));expect(html).toContain('Submitted label');expect(html).toContain('Original answer');expect(html).not.toContain('Current label');expect(html).not.toContain('Hidden value');
 });
 it('excludes credentials and internal controls while rendering values as text',()=>{
  const record={answers:{'text-1':'<img src=x onerror=alert(1)>','password-1':'PRIVATE_PASSWORD','hidden-1':'PRIVATE_INTERNAL','upload-1':'PRIVATE_STORAGE','_private':'PRIVATE_KEY'},form_snapshot:{fields:[...form.fields,{id:'password-1',type:'password'},{id:'hidden-1',type:'hidden'},{id:'upload-1',type:'upload'},{id:'_private',type:'text'}]}};
  const html=renderToStaticMarkup(createElement(SubmittedFormAnswers,{form,record}));expect(html).toContain('&lt;img');expect(html).not.toContain('<img');expect(html).not.toContain('PRIVATE_');
 });
});
