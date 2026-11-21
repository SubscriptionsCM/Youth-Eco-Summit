// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('next/link',()=>({default:'a'}));
vi.mock('next/navigation',()=>({usePathname:()=>'/login'}));
const request=vi.hoisted(()=>vi.fn());
vi.mock('../src/components/api',async original=>({...await original<typeof import('../src/components/api')>(),api:request}));
import {ApiError} from '../src/components/api';
import {LoginPage} from '../src/components/auth-pages';
import {EmailAccount} from '../src/components/email-account';
import {ReferenceLogin} from '../src/components/reference-login';
import {loginAudienceFromSearch} from '../src/components/auth-navigation';
let host:HTMLDivElement,root:Root;
beforeEach(()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);window.history.replaceState(null,'','/login');request.mockReset();
 request.mockImplementation(async(path:string)=>path==='/api/forms/config'?{emailAccounts:true,accountProvider:'native'}:Promise.reject(new Error('Unexpected test request')));
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
const button=(text:string)=>[...host.querySelectorAll('button')].find(button=>button.textContent===text)!;
async function click(text:string){await act(async()=>button(text).click());}
async function fill(name:string,value:string){await act(async()=>{const input=host.querySelector<HTMLInputElement>(`[name=${name}]`)!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});}
async function submit(){await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));}
it('shows four flat account choices with educator purpose and no public participant label',async()=>{
 await act(async()=>root.render(createElement(LoginPage)));
 expect([...host.querySelectorAll('.login-role-switch button')].map(button=>button.textContent)).toEqual(['Student','Educator','School','Admin or judge']);
 expect(host.textContent).not.toMatch(/participant/i);await click('Educator');
 expect(host.querySelector('h1')?.textContent).toBe('Educator sign in');expect(host.textContent).toContain('Manage student participation');
 await click('Forgot your password?');expect(host.textContent).toContain('Recover your educator account');
});
it.each([['Student','student','/api/auth/participant/login'],['Educator','educator','/api/auth/participant/login'],['School','school','/api/auth/participant/login'],['Admin or judge','admin','/api/auth/login']])('sends the selected %s native login audience with one password',async(label,audience,path)=>{
 await act(async()=>root.render(createElement(LoginPage)));await click(label);await fill('contact','synthetic-identifier');await fill('password','Synthetic-password-123');
 expect(host.querySelector('[name=confirmPassword]')).toBeNull();request.mockRejectedValueOnce(new ApiError('Synthetic credentials rejected',undefined,401));await submit();
 expect(request).toHaveBeenLastCalledWith(path,expect.objectContaining({body:JSON.stringify({contact:'synthetic-identifier',password:'Synthetic-password-123',loginAudience:audience})}));
});
it.each([['Student','student'],['Educator','teacher'],['School','school']])('fixes new %s signup to its selected kind',async(label,formKey)=>{
 await act(async()=>root.render(createElement(LoginPage)));await click(label);await click('Create a new account');
 expect(host.querySelector('[name=formKey]')).toBeNull();await fill('contact','synthetic@example.test');await fill('username','synthetic-name');await fill('password','Synthetic-password-123');await fill('confirmPassword','Synthetic-password-123');
 request.mockResolvedValueOnce({sent:true,message:'Check your email'});await submit();
 expect(request).toHaveBeenLastCalledWith('/api/auth/participant/signup',expect.objectContaining({body:JSON.stringify({contact:'synthetic@example.test',username:'synthetic-name',formKey})}));
});
it('switches a verified mismatch to the correct option, retaining only the identifier',async()=>{
 const changed=vi.fn();window.addEventListener('yes-auth-changed',changed);
 try{
  await act(async()=>root.render(createElement(LoginPage)));await fill('contact','synthetic-alias');await fill('password','Synthetic-password-123');
  request.mockRejectedValueOnce(new ApiError('Use another option.',{raw_internal_field:'Hidden detail'},409,{code:'LOGIN_AUDIENCE_MISMATCH',loginAudience:'educator'}));await submit();
  expect(host.textContent).toContain('You do not need to reset your password');expect(host.textContent).not.toContain('raw_internal_field');expect(request).not.toHaveBeenCalledWith('/api/auth/session');expect(changed).not.toHaveBeenCalled();
  await click('Use Educator sign-in');expect(host.querySelector('h1')?.textContent).toBe('Educator sign in');expect(host.querySelector<HTMLInputElement>('[name=contact]')?.value).toBe('synthetic-alias');expect(host.querySelector<HTMLInputElement>('[name=password]')?.value).toBe('');
 }finally{window.removeEventListener('yes-auth-changed',changed);}
});
it('clears pending verification and its password when changing account type',async()=>{
 await act(async()=>root.render(createElement(LoginPage)));await click('Create a new account');await fill('contact','synthetic@example.test');await fill('username','synthetic-name');await fill('password','Synthetic-password-123');await fill('confirmPassword','Synthetic-password-123');request.mockResolvedValueOnce({message:'Check your email'});await submit();
 expect(host.querySelector('[name=code]')).not.toBeNull();await click('Educator');await click('Student');
 expect(host.querySelector('[name=code]')).toBeNull();expect(host.querySelector<HTMLInputElement>('[name=password]')?.value).toBe('');expect(host.querySelector<HTMLInputElement>('[name=contact]')?.value).toBe('synthetic@example.test');
});
it('selects an educator URL hint and safe return without changing the stored account kind',async()=>{
 window.history.replaceState(null,'','/login?type=educator&next=%2Fadmin');await act(async()=>root.render(createElement(LoginPage)));
 expect(host.querySelector('h1')?.textContent).toBe('Educator sign in');expect(button('Educator').getAttribute('aria-pressed')).toBe('true');
});
it('replaces the selected URL type and preserves the safe return and hash across refresh',async()=>{
 const next='/forms/teacher?edition=2027';window.history.replaceState(null,'',`/login?${new URLSearchParams({type:'educator',next})}#account`);
 const entries=window.history.length,replace=vi.spyOn(window.history,'replaceState');
 try{
  await act(async()=>root.render(createElement(LoginPage)));await fill('contact','synthetic-alias');await fill('password','Synthetic-password-123');await click('Student');
  expect(replace).toHaveBeenCalledTimes(1);expect(window.history.length).toBe(entries);expect(new URLSearchParams(window.location.search).get('type')).toBe('student');expect(new URLSearchParams(window.location.search).get('next')).toBe(next);expect(window.location.hash).toBe('#account');expect(loginAudienceFromSearch(window.location.search)).toBe('student');
  expect(host.querySelector<HTMLInputElement>('[name=contact]')?.value).toBe('synthetic-alias');expect(host.querySelector<HTMLInputElement>('[name=password]')?.value).toBe('');
  await act(async()=>root.unmount());root=createRoot(host);await act(async()=>root.render(createElement(LoginPage)));expect(host.querySelector('h1')?.textContent).toBe('Student sign in');
 }finally{replace.mockRestore();}
});
it('gives embedded forms matching role copy, native hint and a safe link after mismatch',async()=>{
 const signedIn=vi.fn();window.history.replaceState(null,'','/register');await act(async()=>root.render(createElement(EmailAccount,{registrationForm:'teacher',onSignedIn:signedIn})));
 expect(host.textContent).toContain('Sign in to your educator account');await fill('contact','synthetic-alias');await fill('password','Synthetic-password-123');request.mockRejectedValueOnce(new ApiError('Wrong option',undefined,409,{code:'LOGIN_AUDIENCE_MISMATCH',loginAudience:'school'}));await submit();
 expect(JSON.parse(request.mock.calls.at(-1)![1].body).loginAudience).toBe('educator');expect(signedIn).not.toHaveBeenCalled();expect(host.querySelector('a')?.getAttribute('href')).toBe('/login?type=school&next=%2Fregister');
});
it.each([[429,'Wait a few minutes'],[503,'temporarily unavailable']])('keeps %s sign-in failures actionable without password blame',async(status,copy)=>{
 await act(async()=>root.render(createElement(EmailAccount,{registrationForm:'student',onSignedIn:vi.fn()})));await fill('contact','synthetic-alias');await fill('password','Synthetic-password-123');request.mockRejectedValueOnce(new ApiError('Provider field_error_72',undefined,status));await submit();
 expect(host.textContent).toContain(copy);expect(host.textContent).not.toContain('field_error_72');expect(host.textContent).not.toContain('incorrect password');
});
it('uses all four role choices on the alternate provider path and omits native audience hints',async()=>{
 await act(async()=>root.render(createElement(ReferenceLogin)));await click('Educator');await fill('contact','synthetic@example.test');await fill('password','Synthetic-password-123');request.mockRejectedValueOnce(new ApiError('Synthetic rejection',undefined,401));await submit();
 expect(host.querySelectorAll('.login-role-switch button')).toHaveLength(4);expect(JSON.parse(request.mock.calls.at(-1)![1].body)).toEqual({contact:'synthetic@example.test',password:'Synthetic-password-123'});
});
