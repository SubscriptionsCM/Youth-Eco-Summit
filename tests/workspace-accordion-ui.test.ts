// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('next/link',()=>({default:'a'}));
vi.mock('../src/domain/review-mode',()=>({dedicatedJudgingMode:()=>false,manualReviewMode:()=>false}));
import {PortalWorkspace} from '../src/components/portal-workspace';
type Props=Parameters<typeof PortalWorkspace>[0];
let root:Root,host:HTMLDivElement;
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function render(props:Partial<Props>={}){await act(async()=>root.render(createElement(PortalWorkspace,{role:'owner',displayRole:'Developer',pathname:'/admin',children:null,...props})));}
function nav(mobile=false){return host.querySelector(`nav[aria-label="${mobile?'Mobile workspace navigation':'Workspace navigation'}"]`)!;}
function trigger(label:string,mobile=false){return Array.from(nav(mobile).querySelectorAll<HTMLButtonElement>('.workspace-nav-trigger')).find(button=>button.textContent===label)!;}
function expanded(mobile=false){return Array.from(nav(mobile).querySelectorAll('.workspace-nav-trigger[aria-expanded="true"]')).map(button=>button.textContent);}
async function click(label:string,mobile=false){await act(async()=>trigger(label,mobile).click());}
it('opens only the current destination group initially, including direct nested routes',async()=>{
 await render();expect(expanded()).toEqual(['Workspace']);
 await render({pathname:'/admin/students'});expect(expanded()).toEqual(['People & enquiries']);
 expect(nav().querySelector('a[aria-current="page"]')?.textContent).toBe('Students');
 await render({pathname:'/admin/judging'});expect(expanded()).toEqual(['Judging']);
 await render({pathname:'/admin/unknown-section'});expect(expanded()).toEqual(['Workspace']);
});
it('closes every other group on opening and permits closing the last open group',async()=>{
 await render();await click('Judging');expect(expanded()).toEqual(['Judging']);
 await click('People & enquiries');expect(expanded()).toEqual(['People & enquiries']);
 await click('Summit setup');expect(expanded()).toEqual(['Summit setup']);
 await click('Operations');expect(expanded()).toEqual(['Operations']);
 await click('Operations');expect(expanded()).toEqual([]);
 await click('Workspace');expect(expanded()).toEqual(['Workspace']);
});
it('shares one expanded selection across desktop and mobile without duplicate aria targets',async()=>{
 await render();await click('People & enquiries',true);
 expect(expanded()).toEqual(['People & enquiries']);expect(expanded(true)).toEqual(['People & enquiries']);
 const ids=Array.from(host.querySelectorAll('[id]')).map(element=>element.id);expect(new Set(ids).size).toBe(ids.length);
 for(const button of host.querySelectorAll<HTMLButtonElement>('.workspace-nav-trigger')){
  expect(button.type).toBe('button');const panel=document.getElementById(button.getAttribute('aria-controls')!);
  expect(panel?.getAttribute('aria-labelledby')).toBe(button.id);
 }
});
it('immediately removes closing links from keyboard navigation and accessibility while retaining animated panels',async()=>{
 await render();await click('People & enquiries');
 const closed=document.getElementById(trigger('Workspace').getAttribute('aria-controls')!)!;
 const open=document.getElementById(trigger('People & enquiries').getAttribute('aria-controls')!)!;
 expect(closed.getAttribute('aria-hidden')).toBe('true');expect(closed.hasAttribute('inert')).toBe(true);
 expect(Array.from(closed.querySelectorAll('a')).every(link=>link.tabIndex===-1)).toBe(true);
 expect(open.getAttribute('aria-hidden')).toBe('false');expect(open.hasAttribute('inert')).toBe(false);
 expect(Array.from(open.querySelectorAll('a')).every(link=>!link.hasAttribute('tabindex'))).toBe(true);
 expect(closed.querySelector('a')?.textContent).toBe('Overview');
});
it('reacts to session roles arriving and reopens the current route after navigation',async()=>{
 await render({role:''});expect(expanded()).toEqual([]);
 await render({role:'owner',pathname:'/admin/students'});expect(expanded()).toEqual(['People & enquiries']);
 await click('Judging');expect(expanded()).toEqual(['Judging']);
 await render({pathname:'/admin/editions'});expect(expanded()).toEqual(['Summit setup']);
 await render({pathname:'/admin/students'});expect(expanded()).toEqual(['People & enquiries']);
 expect(host.querySelector('.workspace-role')?.textContent).toBe('Developer');
});
it.each(['student','educator','school'] as const)('preserves %s-specific navigation and opens its current registration group',async participantKind=>{
 const pathname=participantKind==='student'?'/register':participantKind==='educator'?'/teachers/register':'/schools/register';
 await render({role:'participant',participantKind,pathname});expect(expanded()).toEqual(['Registration & schools']);
 expect(Array.from(nav().querySelectorAll('a')).some(link=>link.getAttribute('href')?.startsWith('/admin'))).toBe(false);
 expect(nav().querySelector('a[aria-current="page"]')?.getAttribute('href')).toBe(pathname);
 await click('Your workspace');expect(expanded()).toEqual(['Your workspace']);
});
it('preserves the judge workspace without exposing participant registrations',async()=>{
 await render({role:'judge',pathname:'/judge/assignment-one'});expect(expanded()).toEqual(['Review workspace']);
 expect(nav().textContent).not.toContain('registration');expect(nav().querySelector('a[aria-current="page"]')?.getAttribute('href')).toBe('/judge');
});
it('retains mobile Escape focus return and closes its outer menu on route changes',async()=>{
 await render();const menu=host.querySelector<HTMLDetailsElement>('.workspace-mobile-menu')!,summary=menu.querySelector('summary')!;
 menu.open=true;await act(async()=>menu.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));
 expect(menu.open).toBe(false);expect(document.activeElement).toBe(summary);
 menu.open=true;await render({pathname:'/admin/students'});expect(menu.open).toBe(false);expect(expanded(true)).toEqual(['People & enquiries']);
});
