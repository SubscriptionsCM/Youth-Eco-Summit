// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const fixture=vi.hoisted(()=>({role:'owner',row:{} as Record<string,any>,request:vi.fn()}));
vi.mock('next/link',()=>({default:'a'}));
vi.mock('../src/components/api',async original=>({...await original<any>(),api:fixture.request}));
vi.mock('../src/components/shared',async original=>({...await original<any>(),AuthGate:({children}:any)=>children({id:'acting-owner',role:fixture.role}),useResource:()=>({data:{items:[fixture.row],total:1,pageSize:25},loading:false,error:null,reload:vi.fn()})}));
import {AdminPage} from '../src/components/admin';
import {StatusBadge} from '../src/components/portal-ui';
import {EntryReviewHistory} from '../src/components/record-summaries';
let host:HTMLDivElement,root:Root;
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;vi.stubEnv('NEXT_PUBLIC_JUDGING_MODE','portal');fixture.role='owner';fixture.request.mockReset();fixture.request.mockResolvedValue({});fixture.row={id:'5bc2440b-873f-45f4-9589-9db2be73e7af',kind:'verify_portal_file',payload:{fileId:'hidden-file-identifier'},status:'complete',attempts:1,created_at:'2026-11-13T07:41:32Z',updated_at:'2026-11-13T07:41:45Z',last_error:null};host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllEnvs();});
async function open(section:string){await act(async()=>root.render(createElement(AdminPage,{section})));await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='View details')!.click());return host.querySelector('[aria-label="Record details"]')!;}
it('explains a completed file check without JSON, internal identifiers or an unnecessary retry',async()=>{
 const details=await open('jobs');expect(host.textContent).toContain('Check submitted file');expect(details.textContent).toContain('Completed');expect(details.textContent).toContain('Attempts');expect(details.textContent).toContain('No action needed');
 expect(host.querySelector('pre')).toBeNull();expect(host.textContent).not.toContain(fixture.row.id);expect(host.textContent).not.toContain('hidden-file-identifier');expect(host.textContent).not.toContain('verify_portal_file');expect(details.querySelector('select[name="action"]')).toBeNull();
});
it('explains a failed task and keeps a retry available without showing server diagnostics',async()=>{
 fixture.row={...fixture.row,status:'failed',last_error:'SQLSTATE 08006 /home/private/runtime/internal.js'};const details=await open('jobs');expect(details.textContent).toContain('Needs attention');expect(details.textContent).toContain('Try task again');expect(details.textContent).not.toContain('SQLSTATE');expect(details.textContent).not.toContain('/home/private');expect(details.querySelector('select[name="action"]')).not.toBeNull();
});
it('shows readable activity and its reason without dumping private details',async()=>{
 fixture.row={id:fixture.row.id,action:'judging.assign',entity_type:'judging_assignments',actor_name:'QA coordinator',detail:{reason:'First review',entryId:'hidden-entry-id',token:'hidden-sensitive-value'},created_at:'2026-11-13T07:41:32Z'};const details=await open('audit');
 expect(host.textContent).toContain('Entry assigned to a judge');expect(details.textContent).toContain('First review');expect(details.textContent).toContain('QA coordinator');expect(host.querySelector('pre')).toBeNull();expect(host.textContent).not.toContain('hidden-entry-id');expect(host.textContent).not.toContain('hidden-sensitive-value');
});
it('shows Trash as a readable group and retains owner confirmation without asking for a database ID',async()=>{
 fixture.row={id:fixture.row.id,root_type:'schools',root_label:'QA school (SCH-ONE)',reason:'Duplicate school registration',status:'trashed',items:[{type:'schools',id:'hidden-school'},{type:'submissions',id:'hidden-entry'}],created_at:'2026-11-13T07:41:32Z'};await open('trash');
 expect(host.textContent).toContain('School records');expect(host.textContent).toContain('Competition entries');expect(host.querySelector('pre')).toBeNull();expect(host.textContent).not.toContain('hidden-school');
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Review permanent deletion')!.click());
 const input=host.querySelector('input[name="confirmation"]') as HTMLInputElement;expect(input.pattern).toBe('DELETE');expect(input.form!.textContent).toContain('QA school (SCH-ONE)');expect(host.textContent).not.toContain(fixture.row.id);
 input.value='wrong';await act(async()=>input.form!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(fixture.request).not.toHaveBeenCalled();
 input.value='DELETE';await act(async()=>input.form!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(fixture.request).toHaveBeenCalledWith(`/api/admin/trash/${fixture.row.id}/purge`,expect.objectContaining({method:'POST',body:JSON.stringify({confirmation:fixture.row.id})}));
});
it('keeps permanent deletion unavailable to an administrator',async()=>{
 fixture.role='admin';fixture.row={id:fixture.row.id,root_type:'schools',status:'trashed',items:[],reason:'Duplicate'};await open('trash');expect(host.textContent).not.toContain('Review permanent deletion');
});
it('summarizes a move-to-Trash preview without losing the related-record acknowledgement',async()=>{
 fixture.row={id:fixture.row.id,name:'QA school',reference:'SCH-ONE',status:'active',contacts:[]};fixture.request.mockResolvedValue({items:[{type:'schools',id:fixture.row.id},{type:'submissions',id:'hidden-entry'}],counts:{schools:1,submissions:1},dependencies:1,teacherRegistrations:[]});await act(async()=>root.render(createElement(AdminPage,{section:'schools'})));
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Preview move to Trash')!.click());expect(host.textContent).toContain('QA school');expect(host.textContent).toContain('Competition entries');expect(host.querySelector('input[name="includeDependencies"]')).not.toBeNull();expect(host.querySelector('pre')).toBeNull();expect(host.textContent).not.toContain('hidden-entry');
});
it.each([['complete','Completed'],['processing','Checking file'],['in_progress','In progress'],['purge_failed','Deletion needs attention']])('uses a readable status for %s',async(value,text)=>{await act(async()=>root.render(createElement(StatusBadge,{value})));expect(host.textContent).toBe(text);});
it('keeps relevant scores, review eligibility and decisions readable in earlier entry history',async()=>{
 await act(async()=>root.render(createElement(EntryReviewHistory,{details:{assignments:[{id:'hidden-assignment',judge_name:'QA judge',active:true,revision:2}],reviews:[{id:'hidden-review',assignment_id:'hidden-assignment',status:'submitted',revision:2,scores:{originality:8},eligible_for_results:false,comment:'Clear idea',flag:'conflict'}],decisions:[{id:'hidden-decision',from_state:'longlisted',to_state:'shortlisted',jury_reference:'JURY-ONE',reason:'Approved by jury'}]}})));
 expect(host.textContent).toContain('Originality');expect(host.textContent).toContain('8');expect(host.textContent).toContain('Excluded from results');expect(host.textContent).toContain('Conflict of interest');expect(host.textContent).toContain('JURY-ONE');expect(host.textContent).toContain('Shortlisted');expect(host.textContent).toContain('Completed');expect(host.querySelector('pre')).toBeNull();expect(host.textContent).not.toContain('hidden-');
});
it('keeps school correction details understandable while omitting unrelated private fields',async()=>{
 fixture.row={id:fixture.row.id,action:'school.correction',entity_type:'schools',entity_label:'QA school (SCH-ONE)',detail:{before:{city:'Delhi',password:'secret-before'},after:{city:'Mumbai',password:'secret-after'}}};const details=await open('audit');expect(details.textContent).toContain('QA school (SCH-ONE)');expect(details.textContent).toContain('City');expect(details.textContent).toContain('Delhi');expect(details.textContent).toContain('Mumbai');expect(details.textContent).not.toContain('secret-');
});
it.each([['judging.round.state',{open:false},'Closed'],['consent.publication',{accepted:false},'Not granted']])('explains the actual change for %s',async(action,detail,text)=>{fixture.row={id:fixture.row.id,action,detail};const details=await open('audit');expect(details.textContent).toContain(text);});
