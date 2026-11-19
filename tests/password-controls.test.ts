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
import {AccountSetup} from '../src/components/auth-pages';
let host:HTMLDivElement,root:Root;
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;request.mockReset();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it('masks passwords initially and toggles each field independently without submitting',async()=>{
 const submit=vi.fn();await act(async()=>root.render(createElement('form',{onSubmit:submit},createElement(Field,{name:'password',title:'Password',type:'password',required:true}),createElement(Field,{name:'confirmPassword',title:'Confirm password',type:'password',required:true}))));
 const inputs=host.querySelectorAll('input'),buttons=host.querySelectorAll('button');expect(buttons.length).toBe(2);expect([...inputs].map(i=>i.type)).toEqual(['password','password']);
 inputs[0].value='Private test value';await act(async()=>buttons[0].click());expect(inputs[0].type).toBe('text');expect(inputs[0].value).toBe('Private test value');expect(inputs[1].type).toBe('password');expect(buttons[0].getAttribute('aria-pressed')).toBe('true');expect(submit).not.toHaveBeenCalled();
 await act(async()=>buttons[0].click());expect(inputs[0].type).toBe('password');
});
it.each(['wordpress','supabase'] as const)('requires matching participant login passwords for %s before requesting authentication',async provider=>{
 await act(async()=>root.render(createElement(EmailAccount,{provider,onSignedIn:vi.fn()})));
 const password=host.querySelector<HTMLInputElement>('[name=password]')!,confirm=host.querySelector<HTMLInputElement>('[name=confirmPassword]');expect(confirm?.required).toBe(true);
 password.value='Example password';confirm!.value='Different password';await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(request).not.toHaveBeenCalled();expect(host.querySelector('[role=alert]')?.textContent).toContain('passwords must match');
});
it('shows password confirmation instead of an authenticator on judge sign-in and rejects mismatches',async()=>{
 await act(async()=>root.render(createElement(JudgeSignIn)));expect(host.textContent).not.toMatch(/authenticator/i);expect(host.querySelector('[name=totp]')).toBeNull();
 host.querySelector<HTMLInputElement>('[name=password]')!.value='One password';host.querySelector<HTMLInputElement>('[name=confirmPassword]')!.value='Another';
 await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(request).not.toHaveBeenCalled();expect(host.querySelector('[role=alert]')?.textContent).toContain('passwords must match');
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
