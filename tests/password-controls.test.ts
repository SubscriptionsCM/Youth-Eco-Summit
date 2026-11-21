// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('next/navigation',()=>({usePathname:()=>'/login'}));
vi.mock('next/link',()=>({default:'a'}));
const request=vi.hoisted(()=>vi.fn());
vi.mock('../src/components/api',async original=>({...await original<typeof import('../src/components/api')>(),api:request}));
import {Field} from '../src/components/shared';
import {EmailAccount} from '../src/components/email-account';
import {JudgeSignIn} from '../src/components/judge-portal-login';
import {AccountSetup,LoginPage} from '../src/components/auth-pages';
let host:HTMLDivElement,root:Root;
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;request.mockReset();window.history.replaceState(null,'','/login');host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it('masks passwords initially and toggles each field independently without submitting',async()=>{
 const submit=vi.fn();await act(async()=>root.render(createElement('form',{onSubmit:submit},createElement(Field,{name:'password',title:'Password',type:'password',required:true}),createElement(Field,{name:'confirmPassword',title:'Confirm password',type:'password',required:true}))));
 const inputs=host.querySelectorAll('input'),buttons=host.querySelectorAll('button');expect(buttons.length).toBe(2);expect([...inputs].map(i=>i.type)).toEqual(['password','password']);
 inputs[0].value='Private test value';await act(async()=>buttons[0].click());expect(inputs[0].type).toBe('text');expect(inputs[0].value).toBe('Private test value');expect(inputs[1].type).toBe('password');expect(buttons[0].getAttribute('aria-pressed')).toBe('true');expect(submit).not.toHaveBeenCalled();
 await act(async()=>buttons[0].click());expect(inputs[0].type).toBe('password');
});
it.each(['native','wordpress','supabase'] as const)('uses one password for %s sign-in and keeps confirmation for signup',async provider=>{
 await act(async()=>root.render(createElement(EmailAccount,{provider,onSignedIn:vi.fn()})));
 expect(host.querySelector('[name=password]')).not.toBeNull();expect(host.querySelector('[name=confirmPassword]')).toBeNull();
 await act(async()=>[...host.querySelectorAll('button')].find(button=>button.textContent==='Create a new account')!.click());
 expect(host.querySelector<HTMLInputElement>('[name=confirmPassword]')?.required).toBe(true);
});
it('uses one password on judge sign-in and submits the staff audience',async()=>{
 request.mockRejectedValue(new Error('Synthetic sign-in rejected'));
 await act(async()=>root.render(createElement(JudgeSignIn)));expect(host.textContent).not.toMatch(/authenticator/i);expect(host.querySelector('[name=totp]')).toBeNull();
 const contact=host.querySelector<HTMLInputElement>('[name=contact]')!;expect(contact.type).toBe('text');expect(contact.autocomplete).toBe('username');expect(contact.labels?.[0].textContent).toContain('Judge email or username');
 contact.value='synthetic-judge';host.querySelector<HTMLInputElement>('[name=password]')!.value='One synthetic password';expect(host.querySelector('[name=confirmPassword]')).toBeNull();
 await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(request).toHaveBeenCalledWith('/api/auth/login',expect.objectContaining({body:JSON.stringify({contact:'synthetic-judge',password:'One synthetic password',loginAudience:'admin'})}));
});
it('accepts a staff username while preserving participant contact input',async()=>{
 request.mockResolvedValue({emailAccounts:false});await act(async()=>root.render(createElement(LoginPage)));
 expect(host.querySelector<HTMLInputElement>('[name=contact]')?.type).toBe('tel');
 await act(async()=>[...host.querySelectorAll('button')].find(button=>button.textContent==='Admin or judge')!.click());
 const contact=host.querySelector<HTMLInputElement>('[name=contact]')!;expect(contact.type).toBe('text');expect(contact.autocomplete).toBe('username');expect(contact.labels?.[0].textContent).toContain('Staff email or username');
});
it('keeps invitation setup password-only and never requests enrollment information',async()=>{
 window.history.replaceState(null,'','/invite?token=test-only');request.mockResolvedValue({contact:'judge@example.org'});
 await act(async()=>root.render(createElement(AccountSetup)));await act(async()=>host.querySelector<HTMLButtonElement>('button')!.click());
 expect(host.textContent).not.toMatch(/authenticator/i);expect(host.querySelector('[name=confirmPassword]')).not.toBeNull();expect(host.querySelector('[name=totp]')).toBeNull();
});
it('requires matching new passwords for staff recovery without an authenticator',async()=>{
 window.history.replaceState(null,'','/recover?token=test-only');await act(async()=>root.render(createElement(AccountSetup,{recovery:true})));
 expect(host.textContent).not.toMatch(/authenticator/i);expect(host.querySelector('[name=totp]')).toBeNull();
 host.querySelector<HTMLInputElement>('[name=password]')!.value='New password long enough';host.querySelector<HTMLInputElement>('[name=confirmPassword]')!.value='Different';
 await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(request).not.toHaveBeenCalled();expect(host.querySelector('[role=alert]')?.textContent).toContain('passwords must match');
});
it.each([['admin','/login?next=%2Fadmin'],['owner','/login?next=%2Fadmin'],['judge','/judge/login']])('shows the token-bound staff username and correct %s sign-in link',async(role,href)=>{
 window.history.replaceState(null,'','/invite?token=test-only');request.mockResolvedValueOnce({contact:'staff@example.org',staffUsername:'rudhraksh',role}).mockResolvedValueOnce({accepted:true,staffUsername:'rudhraksh',role});
 await act(async()=>root.render(createElement(AccountSetup)));await act(async()=>host.querySelector<HTMLButtonElement>('button')!.click());
 expect(host.textContent).toContain('rudhraksh');expect(host.textContent).toContain('staff@example.org');expect(host.querySelector('[name=staffUsername]')).toBeNull();
 for(const name of ['password','confirmPassword']){const input=host.querySelector<HTMLInputElement>(`[name=${name}]`)!;expect(input.minLength).toBe(12);input.value='Long enough test password';}
 await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(JSON.parse(request.mock.calls[1][1].body)).toEqual({token:'test-only',password:'Long enough test password',confirmPassword:'Long enough test password'});
 expect(host.querySelector('a')?.getAttribute('href')).toBe(href);expect(host.textContent).toContain('email or username');
});
it('keeps staff recovery email-only',async()=>{
 await act(async()=>root.render(createElement(AccountSetup,{recovery:true})));expect(host.querySelector<HTMLInputElement>('[name=contact]')?.type).toBe('email');
});
