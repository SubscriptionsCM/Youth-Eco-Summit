// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({actor:{id:'acting-admin',role:'admin'},resource:{id:'other-owner',contact:'owner@qa.example',name:'QA owner',role:'owner',active:true,created_at:'2026-11-01T00:00:00Z'}}));
vi.mock('next/link',()=>({default:'a'}));
vi.mock('../src/components/shared',async original=>{const actual=await original<any>();return {...actual,AuthGate:({children}:any)=>children(state.actor),useResource:(path:string|null)=>({data:path==='/api/admin/overview'?{reference_submissions_all_editions:18,archived_source_entries_all_editions:6000,archived_source_files_all_editions:714,failed_jobs_all_editions:0,student_participations:0}:path==='/api/judging/admin'?{rounds:[],total:0}:{items:[state.resource],pageSize:25,total:1},loading:false,error:null,reload:vi.fn()})};});
import {AdminPage} from '../src/components/admin';
import {AdminOverview} from '../src/components/admin-overview';
import {AdminRecordDetails} from '../src/components/admin-details';
let host:HTMLDivElement,root:Root;
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;vi.stubEnv('NEXT_PUBLIC_JUDGING_MODE','portal');state.actor={id:'acting-admin',role:'admin'};state.resource={id:'other-owner',contact:'owner@qa.example',name:'QA owner',role:'owner',active:true,created_at:'2026-11-01T00:00:00Z'};host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllEnvs();});
it('provides current operations and file access without exposing obsolete import/configuration tools',async()=>{
 await act(async()=>root.render(createElement(AdminPage,{section:'tools'})));
 const links=[...host.querySelectorAll('a')].map(a=>a.getAttribute('href'));
 for(const href of ['/admin/jobs','/admin/audit','/admin/trash','/admin/reference-forms'])expect(links).toContain(href);
 for(const href of ['/admin/imports','/admin/editions','/admin/competitions','/admin/content','/admin/rules'])expect(links).not.toContain(href);
 expect(host.textContent).not.toContain('Configuration JSON');
});
it('removes empty earlier-workflow totals from the active dashboard',async()=>{
 await act(async()=>root.render(createElement(AdminOverview)));
 expect(host.querySelectorAll('.dashboard-metrics .portal-metric')).toHaveLength(4);
 expect(host.querySelectorAll('.dashboard-actions>a')).toHaveLength(3);
 expect(host.querySelector('.dashboard-history')).toBeNull();
 expect(host.querySelector('.dashboard-records')?.textContent).toContain('Forms & attachments');
 expect(host.textContent).not.toMatch(/WordPress|New website|saved from|archive/i);
 expect(host.textContent).not.toContain('Additional record totals');expect(host.textContent).not.toContain('Student participations');
});
it('shows readable staff details and removes actions the acting admin is not allowed to perform',async()=>{
 await act(async()=>root.render(createElement(AdminPage,{section:'judges'})));
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='View details')!.click());
 const details=host.querySelector('[aria-label="Record details"]')!;
 expect(details.textContent).toContain('QA owner');expect(details.textContent).toContain('owner@qa.example');expect(details.textContent).not.toContain('Technical record details');
 expect(details.querySelector('select[name="action"]')).toBeNull();
 expect([...host.querySelectorAll('select[name="role"] option')].map(o=>(o as HTMLOptionElement).value)).not.toContain('admin');
});
it('keeps the ownerâ€™s staff invitation and administrative-account management available',async()=>{
 state.actor={id:'acting-owner',role:'owner'};state.resource={...state.resource,id:'another-admin',role:'admin'};
 await act(async()=>root.render(createElement(AdminPage,{section:'judges'})));
 expect([...host.querySelectorAll('select[name="role"] option')].map(o=>(o as HTMLOptionElement).value)).toContain('admin');
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='View details')!.click());
 expect(host.querySelector('[aria-label="Record details"] select[name="action"]')).not.toBeNull();
});
it('keeps school details and current registration links without an empty earlier-workflow section',async()=>{
 await act(async()=>root.render(createElement(AdminRecordDetails,{resource:'schools',row:{id:'school-one',reference:'SCH-ONE',name:'QA school',status:'active',contacts:[],participations:[]}})));
 const links=[...host.querySelectorAll('a')].map(a=>a.getAttribute('href'));
 expect(links).toContain('/admin/reference-forms?schoolId=school-one&formKey=student');expect(links).toContain('/admin/reference-forms?schoolId=school-one');
 expect(links.some(href=>href?.startsWith('/admin/students')||href?.startsWith('/admin/entries'))).toBe(false);
 expect(host.textContent).toContain('SCH-ONE');expect(host.textContent).toContain('School contacts and coordinators');expect(host.textContent).not.toContain('Annual participation');
});
it('preserves management actions for eligible judges and prevents self-deactivation for an owner',async()=>{
 state.resource={...state.resource,id:'judge-one',role:'judge'};await act(async()=>root.render(createElement(AdminPage,{section:'judges'})));
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='View details')!.click());
 expect(host.querySelector('[aria-label="Record details"] select[name="action"]')).not.toBeNull();
 await act(async()=>root.unmount());root=createRoot(host);state.actor={id:'other-owner',role:'owner'};state.resource={...state.resource,id:'other-owner',role:'owner'};
 await act(async()=>root.render(createElement(AdminPage,{section:'judges'})));await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='View details')!.click());
 expect(host.querySelector('[aria-label="Record details"] select[name="action"]')).toBeNull();
});
