// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const session=vi.hoisted(()=>({read:vi.fn()}));
vi.mock('next/navigation',()=>({usePathname:()=>'/dashboard'}));
vi.mock('next/link',()=>({default:'a'}));
vi.mock('next/image',()=>({default:()=>null}));
vi.mock('../src/components/header-socials',()=>({HeaderSocials:()=>null}));
vi.mock('../src/components/api',()=>({api:session.read,json:()=>({})}));
import {SiteShell} from '../src/components/site-shell';
import {signedOutPath} from '../src/components/auth-navigation';
let host:HTMLDivElement,root:Root;
beforeEach(async()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;session.read.mockReset();session.read.mockResolvedValue({actor:{id:'qa',role:'participant'}});host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(createElement(SiteShell,{children:createElement('input',{'aria-label':'Unsaved form field'})})));});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it('dismisses the dropdown on outside pointer and focus without losing page state',async()=>{
 const menu=host.querySelector<HTMLDetailsElement>('.yes-account-menu')!,field=host.querySelector<HTMLInputElement>('main input')!;field.value='Unsaved answer';
 menu.open=true;await act(async()=>field.dispatchEvent(new Event('pointerdown',{bubbles:true})));expect(menu.open).toBe(false);
 menu.open=true;await act(async()=>field.focus());expect(menu.open).toBe(false);expect(field.value).toBe('Unsaved answer');
});
it('keeps an unsuccessful sign-out visible and leaves the current account intact',async()=>{
 session.read.mockImplementation((path:string)=>path==='/api/auth/logout'?Promise.reject(new Error('Please retry sign out.')):Promise.resolve({actor:{id:'qa',role:'participant'}}));
 const menu=host.querySelector<HTMLDetailsElement>('.yes-account-menu')!;menu.open=true;
 await act(async()=>menu.querySelector<HTMLButtonElement>('button')!.click());
 expect(menu.open).toBe(true);expect(menu.querySelector('[role=alert]')?.textContent).toContain('Please retry sign out.');expect(menu.textContent).toContain('My dashboard');
});
it('returns each account type to its appropriate sign-in form',()=>{
 expect(signedOutPath('participant')).toBe('/login');expect(signedOutPath('judge')).toBe('/judge/login');
 expect(signedOutPath('admin')).toBe('/login?next=%2Fadmin');expect(signedOutPath('owner')).toBe('/login?next=%2Fadmin');expect(signedOutPath()).toBe('/login');
});
