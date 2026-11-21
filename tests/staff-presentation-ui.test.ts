// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {afterEach,expect,it,vi} from 'vitest';
const session=vi.hoisted(()=>({actor:{id:'developer',role:'owner',displayRole:'Developer'} as Record<string,unknown>}));
vi.mock('next/navigation',()=>({usePathname:()=>'/admin/judges'}));
vi.mock('next/link',()=>({default:'a'}));
vi.mock('next/image',()=>({default:()=>null}));
vi.mock('../src/components/header-socials',()=>({HeaderSocials:()=>null}));
vi.mock('../src/components/api',async importOriginal=>({...await importOriginal<object>(),api:async()=>({actor:session.actor})}));
import {SiteShell} from '../src/components/site-shell';
import {PortalWorkspace} from '../src/components/portal-workspace';
import {AdminRecordDetails} from '../src/components/admin-details';
let root:Root|undefined,host:HTMLDivElement|undefined;
afterEach(async()=>{if(root)await act(async()=>root!.unmount());host?.remove();root=undefined;host=undefined;});
it('passes the presentation label from the confirmed session to the workspace sidebar',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 await act(async()=>root!.render(createElement(SiteShell,{children:createElement('p',null,'Staff account details')})));
 expect(host.querySelector('.workspace-role')?.textContent).toBe('Developer');
 expect(host.querySelector('nav[aria-label="Workspace navigation"]')?.textContent).toContain('Staff accounts');
});
it.each([['owner',undefined,'Owner'],['admin','Developer','Administrator'],['judge','Developer','Judge']])('retains other account labels for %s',(role,displayRole,expected)=>{
 const html=renderToStaticMarkup(createElement(PortalWorkspace,{role:role!,displayRole,pathname:'/admin',children:null}));
 expect(html).toContain(`<span class="workspace-role">${expected}</span>`);
});
it('shows Developer in staff details while retaining the Owner fallback for other owners',()=>{
 const base={id:'staff',name:'Rudhraksh (Developer)',role:'owner',contact:'developer@example.test',active:true};
 const developer=renderToStaticMarkup(createElement(AdminRecordDetails,{resource:'judges',row:{...base,displayRole:'Developer'}}));
 const owner=renderToStaticMarkup(createElement(AdminRecordDetails,{resource:'judges',row:{...base,name:'Organization owner'}}));
 expect(developer).toContain('<dt>Role</dt><dd>Developer</dd>');expect(owner).toContain('<dt>Role</dt><dd>owner</dd>');
});
