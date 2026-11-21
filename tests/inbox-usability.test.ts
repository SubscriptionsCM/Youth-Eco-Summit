// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
vi.mock('next/link',()=>({default:'a'}));
const fixture=vi.hoisted(()=>({path:'',dataPath:'',freeze:false,error:'',contact:false,missing:false,reload:vi.fn()}));
vi.mock('../src/components/shared',async original=>({...await original<any>(),useResource:(path:string)=>{
 fixture.path=path;if(!fixture.freeze)fixture.dataPath=path;const key=new URL(path,'https://qa.example').searchParams.get('formKey');
 const item=fixture.contact?{id:'contact-one',form_key:'legacy-12146',title:'Contact',reference:'CONTACT-101',status:'submitted',href:'/history/contact-one',dateSource:'wordpress',contact:fixture.missing?{name:'',email:'',phone:'',messagePreview:''}:{name:'Asha Singh',email:'asha@qa.example',phone:'+91 90000 00001',messagePreview:'Please help with a visit. <img src=x onerror=alert(1)> …'}}:{id:'entry-one',form_key:'student',reference:'YES-101',status:'submitted',school_name:'QA school',submitted_at:'2026-11-14T06:00:00Z',file_count:2};
 return {dataPath:fixture.dataPath,loading:false,error:fixture.error,reload:fixture.reload,data:{items:key==='school'?[]:[item],total:key==='school'?0:1,pageSize:25,formTotals:{student:1,teacher:0,school:0,'legacy-12146':1}}};
}}));
import {ReferenceInbox} from '../src/components/reference-inbox';
let host:HTMLDivElement,root:Root;
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;fixture.path='';fixture.dataPath='';fixture.freeze=false;fixture.error='';fixture.contact=false;fixture.missing=false;fixture.reload.mockReset();localStorage.clear();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();});
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
it('labels Contact name, email, phone and preview in both layouts with an explicit details destination',async()=>{
 fixture.contact=true;await render();
 for(const layout of ['list','cards']){
  const summary=host.querySelector('.inbox-contact-details')!;
  expect([...summary.querySelectorAll('dt')].map(dt=>dt.textContent)).toEqual(['Name','Email','Phone','Message preview']);
  expect(summary.textContent).toContain('Asha Singh');expect(summary.textContent).toContain('asha@qa.example');expect(summary.textContent).toContain('+91 90000 00001');expect(summary.textContent).toContain('<img');expect(summary.querySelector('img')).toBeNull();
  const link=[...host.querySelectorAll('a')].find(a=>a.textContent?.includes('View details'))!;expect(link.getAttribute('href')).toBe('/history/contact-one');expect(link.getAttribute('aria-label')).toContain('CONTACT-101');
  if(layout==='list')await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Card view"]')!.click());
 }
});
it('states missing Contact fields plainly without treating a query as the person',async()=>{
 fixture.contact=true;fixture.missing=true;await render();expect(host.querySelector('.inbox-contact-details')!.querySelectorAll('dd')).toHaveLength(4);
 expect([...host.querySelectorAll('.inbox-contact-details dd')].every(dd=>dd.textContent==='Not recorded')).toBe(true);
});
it('defaults mobile to cards and keeps a chosen list keyboard-accessible in its own scroll region',async()=>{
 vi.spyOn(window,'matchMedia').mockReturnValue({matches:true} as MediaQueryList);
 await render();expect(host.querySelector('.submission-card')).not.toBeNull();expect(host.querySelector('table')).toBeNull();
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="List view"]')!.click());
 const region=host.querySelector<HTMLElement>('[aria-label="Submission results"]')!;expect(region.tabIndex).toBe(0);region.focus();expect(document.activeElement).toBe(region);expect(region.querySelectorAll('col')).toHaveLength(3);expect(localStorage.getItem('yes.inbox.layout')).toBe('list');
});
it('applies fixed readable columns and normal table wrapping within the actual workspace ancestor',async()=>{
 const style=document.createElement('style');style.textContent='.workspace-body td,.workspace-body th{overflow-wrap:anywhere}'+readFileSync('src/app/portal-refinement.css','utf8');document.head.append(style);host.className='workspace-body';
 try{
  await render();const table=host.querySelector('table')!,heading=table.querySelector('th')!,cell=table.querySelector('td')!;
  expect(getComputedStyle(table).tableLayout).toBe('fixed');expect(getComputedStyle(table).minWidth).toBe('780px');
  for(const element of [heading,cell]){expect(getComputedStyle(element).overflowWrap).toBe('normal');expect(getComputedStyle(element).wordBreak).toBe('normal');}
  expect(getComputedStyle(table.querySelector('.inbox-submission-column')!).width).toBe('220px');expect(getComputedStyle(table.querySelector('.inbox-submitted-column')!).width).toBe('240px');
  expect(getComputedStyle(table.querySelector('.portal-status')!).whiteSpace).toBe('nowrap');
 }finally{style.remove();}
});
