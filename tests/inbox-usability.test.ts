// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('next/link',()=>({default:'a'}));
const fixture=vi.hoisted(()=>({path:'',dataPath:'',freeze:false,error:'',reload:vi.fn()}));
vi.mock('../src/components/shared',async original=>({...await original<any>(),useResource:(path:string)=>{
 fixture.path=path;if(!fixture.freeze)fixture.dataPath=path;const key=new URL(path,'https://qa.example').searchParams.get('formKey');
 return {dataPath:fixture.dataPath,loading:false,error:fixture.error,reload:fixture.reload,data:{items:key==='school'?[]:[{id:'entry-one',form_key:'student',reference:'YES-101',status:'submitted',school_name:'QA school',submitted_at:'2026-11-14T06:00:00Z',file_count:2}],total:key==='school'?0:1,pageSize:25,formTotals:{student:1,teacher:0,school:0,'legacy-12146':1}}};
}}));
import {ReferenceInbox} from '../src/components/reference-inbox';
let host:HTMLDivElement,root:Root;
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;fixture.path='';fixture.dataPath='';fixture.freeze=false;fixture.error='';fixture.reload.mockReset();localStorage.clear();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function render(filters=''){await act(async()=>root.render(createElement(ReferenceInbox,{resource:'reference-forms',initialFilters:filters})));}
function button(name:string){return [...host.querySelectorAll('button')].find(b=>b.textContent?.includes(name))!;}
it('makes form choices and their search-scoped totals visible without opening a dropdown',async()=>{
 await render();const group=host.querySelector('[aria-label="Filter by form type"]')!;expect(group).not.toBeNull();expect(group.textContent).toContain('Students');expect(group.textContent).toContain('1');
 await act(async()=>button('Students').click());expect(new URL(fixture.path,'https://qa.example').searchParams.get('formKey')).toBe('student');expect(button('Students').getAttribute('aria-pressed')).toBe('true');
});
it('offers list and card views of the same record and remembers the chosen presentation only',async()=>{
 await render();expect(host.querySelector('table')).not.toBeNull();await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Card view"]')!.click());
 expect(host.querySelector('table')).toBeNull();expect(host.querySelector('.submission-card')?.textContent).toContain('YES-101');expect(host.querySelector('.submission-card a')?.getAttribute('href')).toBe('/forms/student#saved=entry-one');expect(localStorage.getItem('yes.inbox.layout')).toBe('cards');
});
it('explains empty filtered results and clears school, text, form and page scopes together',async()=>{
 await render('schoolId=school-one&q=Green&page=3');await act(async()=>button('Schools').click());expect(host.textContent).toContain('No submissions match these filters');
 await act(async()=>button('Clear filters').click());const params=new URL(fixture.path,'https://qa.example').searchParams;expect(params.get('schoolId')).toBeNull();expect(params.get('q')).toBe('');expect(params.get('formKey')).toBe('');expect(params.get('page')).toBe('1');
});
it('uses the published contact form key and matching dropdown option',async()=>{
 await render();await act(async()=>button('Contact').click());expect(new URL(fixture.path,'https://qa.example').searchParams.get('formKey')).toBe('legacy-12146');expect(host.querySelector<HTMLSelectElement>('select')!.value).toBe('legacy-12146');
});
it('hides actionable old results as soon as the applied request changes',async()=>{
 await render();fixture.freeze=true;await act(async()=>button('Students').click());expect(host.querySelector('table')).toBeNull();expect(host.querySelector('.submission-card')).toBeNull();expect(host.querySelector('[aria-busy=true]')).not.toBeNull();expect(host.textContent).toContain('Updating submissions');
});
it('gives every result one uniquely named link in each layout',async()=>{
 await render();expect(host.querySelector('table a')?.getAttribute('aria-label')).toContain('YES-101');await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Card view"]')!.click());expect(host.querySelectorAll('.submission-card a').length).toBe(1);expect(host.querySelector('.submission-card a')?.getAttribute('aria-label')).toContain('YES-101');
});
