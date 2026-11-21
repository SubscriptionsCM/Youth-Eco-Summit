// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('next/link',()=>({default:'a'}));
vi.mock('../src/components/unsaved-navigation',()=>({useUnsavedNavigation:()=>{}}));
const request=vi.hoisted(()=>vi.fn());
const account=vi.hoisted(()=>({signedIn:true}));
vi.mock('../src/components/email-account',()=>({EmailAccount:({onSignedIn}:{onSignedIn:(value:unknown)=>void})=>createElement('button',{onClick:()=>{account.signedIn=true;onSignedIn({email:'fixture@example.test',username:'fixture'});}},'Fixture sign in')}));
vi.mock('../src/components/api',async original=>({...await original<typeof import('../src/components/api')>(),api:request}));
import {ApiError} from '../src/components/api';
import {ReferenceControl,ReferenceFormPage} from '../src/components/reference-form';
import {referenceForms} from '../src/domain/wordpress-forms';

let host:HTMLDivElement,root:Root;
beforeEach(()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{callback(0);return 0;});
 window.history.replaceState(null,'','/forms/teacher#saved=fixture');request.mockReset();
 account.signedIn=true;
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
async function mount(formKey:string,fields:Record<string,string>){
 request.mockImplementation(async(path:string)=>{
  if(path==='/api/forms/config')return {enabled:true,accountProvider:'native'};
  if(path==='/api/auth/session')return {actor:{role:'participant',contact:'fixture@example.test'}};
  if(path.endsWith('/submit'))throw new ApiError('Check the highlighted information.',fields,422);
  if(path==='/api/forms/records/fixture')return {id:'fixture',form_key:formKey,status:'draft',current_step:3,lock_version:0,answers:{'email-1':'fixture@example.test','hidden-yes-submitter':'educator','radio-yes-entry-mode':'individual'},files:[]};
  return {items:[],total:0};
 });
 await act(async()=>root.render(createElement(ReferenceFormPage,{formKey})));
 expect(host.querySelector('h2')?.textContent).toBe('Review');
 await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
}
it('returns a school-ID error to the school step without marking unrelated controls',async()=>{
 await mount('teacher',{'registered-school-id':'Select a registered school and confirm its branch.'});
 expect(host.querySelector('h2')?.textContent).toBe('School');
 expect(host.querySelectorAll('.field p[role=alert]')).toHaveLength(1);
 expect(host.querySelector('.field p[role=alert]')?.textContent).toContain('Select a registered school');
 expect(host.querySelector('a[href="/schools"]')?.textContent).toContain('nominate');
 expect(host.querySelector('input[name=email-1]')).toBeNull();
});
it('returns final title errors to the work step with the error visible',async()=>{
 await mount('painting',{'text-yes-title':'Include school and class in the title.'});
 expect(host.querySelector('h2')?.textContent).toBe('Your work');
 expect(host.querySelector('#text-yes-title')?.getAttribute('aria-invalid')).toBe('true');
 expect(host.querySelector('#text-yes-title-error')?.textContent).toBe('Include school and class in the title.');
});
it('normalizes the visible title on blur and explains the conversion',async()=>{
 const field=referenceForms.find(form=>form.key==='painting')!.fields.find(field=>field.id==='text-yes-title')!,change=vi.fn();
 await act(async()=>root.render(createElement(ReferenceControl,{field,answers:{'text-yes-title':'S.J.Public School_class v_जल जीवन'},change,formKey:'painting',record:{},token:'',refresh:async()=>{}})));
 const input=host.querySelector<HTMLInputElement>('#text-yes-title')!;
 await act(async()=>input.dispatchEvent(new FocusEvent('focusout',{bubbles:true})));
 expect(change).toHaveBeenCalledWith('text-yes-title','S_J_Public_School_class_v_जल_जीवन');
 expect(host.textContent).toContain('Spaces and punctuation are converted to underscores.');
});
it('opens the existing saved draft after signing in instead of starting a new form',async()=>{
 account.signedIn=false;
 request.mockImplementation(async(path:string)=>{
  if(path==='/api/forms/config')return {enabled:true,accountProvider:'native'};
  if(path==='/api/auth/session')return {actor:account.signedIn?{id:'fixture-owner',role:'participant',contact:'fixture@example.test'}:null};
  if(path==='/api/forms/records/fixture')return {id:'fixture',form_key:'teacher',status:'draft',current_step:1,lock_version:0,answers:{'email-1':'fixture@example.test'},files:[]};
  throw new Error('Unexpected request '+path);
 });
 await act(async()=>root.render(createElement(ReferenceFormPage,{formKey:'teacher'})));
 expect(request.mock.calls.some(call=>call[0]==='/api/forms/records/fixture')).toBe(false);
 await act(async()=>host.querySelector<HTMLButtonElement>('button')!.click());
 expect(host.querySelector('h2')?.textContent).toBe('Educator');
 expect(request.mock.calls.filter(call=>call[0]==='/api/forms/records/fixture')).toHaveLength(1);
 expect(host.textContent).not.toContain('Start form');expect(window.location.hash).toBe('#saved=fixture');
});
it('announces a newly saved draft so the entry journey cannot change its school context',async()=>{
 window.history.replaceState(null,'','/forms/teacher');
 request.mockImplementation(async(path:string)=>{
  if(path==='/api/forms/config')return {enabled:true,accountProvider:'native'};
  if(path==='/api/auth/session')return {actor:{id:'fixture-owner',role:'participant'}};
  if(path==='/api/forms/records')return {record:{id:'new-draft',form_key:'teacher',status:'draft',current_step:0,answers:{},files:[]},token:'synthetic-key'};
  throw new Error('Unexpected request '+path);
 });
 const changed=vi.fn(),dispatch=vi.spyOn(window,'dispatchEvent');window.addEventListener('hashchange',changed);
 try{
  await act(async()=>root.render(createElement(ReferenceFormPage,{formKey:'teacher'})));
  await act(async()=>[...host.querySelectorAll('button')].find(button=>button.textContent==='Start form')!.click());
  expect(window.location.hash).toBe('#saved=new-draft.synthetic-key');expect(changed).toHaveBeenCalled();
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({type:'hashchange'}));
 }finally{window.removeEventListener('hashchange',changed);dispatch.mockRestore();}
});
