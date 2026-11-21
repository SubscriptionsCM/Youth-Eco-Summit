// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('next/link',()=>({default:'a'}));vi.mock('next/navigation',()=>({usePathname:()=>'/dashboard'}));
const state=vi.hoisted(()=>({actor:{role:'participant',participantKind:'student'} as {role:string;participantKind?:string}}));
vi.mock('../src/components/api',async original=>({...await original<typeof import('../src/components/api')>(),api:async(path:string)=>path==='/api/auth/session'?{actor:state.actor}:{items:path.endsWith('/records')?[{id:'owned',form_key:'teacher',reference:'OWNED',status:'submitted'}]:[]}}));
import {ReferenceDashboard} from '../src/components/reference-dashboard';
let host:HTMLDivElement,root:Root;
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
const show=async()=>act(async()=>root.render(createElement(ReferenceDashboard)));
it.each(['student','educator','school','unclassified'])('shows only the %s account actions and retains owned receipts',async kind=>{
 state.actor={role:'participant',participantKind:kind};await show();
 const links=[...host.querySelectorAll('a')].map(link=>link.getAttribute('href'));
 expect(links.includes('/register')).toBe(kind==='student');expect(links.includes('/teachers/register')).toBe(kind==='educator');expect(links.includes('/schools/register')).toBe(kind==='school');
 expect(links.some(link=>link?.startsWith('/competitions/enter'))).toBe(kind==='student'||kind==='educator');
 expect(links).toContain('/forms/teacher#saved=owned');
 if(kind==='unclassified')expect(host.textContent).toContain('Confirm your account type');
});
it.each(['judge','admin','owner'])('does not expose participant registration controls to %s at /dashboard',async role=>{
 state.actor={role};await show();expect(host.textContent).toContain('does not have access');expect(host.querySelector('.portal-task')).toBeNull();expect(host.textContent).not.toContain('Start a new competition entry');
});
