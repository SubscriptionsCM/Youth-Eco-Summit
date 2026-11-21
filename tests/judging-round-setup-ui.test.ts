// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('next/link',()=>({default:'a'}));
vi.mock('next/navigation',()=>({usePathname:()=>'/admin/judging'}));
const request=vi.hoisted(()=>vi.fn());
vi.mock('../src/components/api',async original=>({...await original<typeof import('../src/components/api')>(),api:request}));
import {ApiError} from '../src/components/api';
import {JudgeAdministration} from '../src/components/judge-portal-admin';

let host:HTMLDivElement,root:Root;
const catalogue=[{key:'painting',title:'Painting'},{key:'blog',title:'Blog'}];
const rubric={criteria:[],penalties:[],total:90};
type Round={id:string;name:string;form_key:string;edition:string;open:boolean;rubric:typeof rubric};
let rounds:Round[];
const round=(id:string,name:string,form_key='painting'):Round=>({id,name,form_key,edition:'2027',open:false,rubric});
beforeEach(()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);window.history.replaceState(null,'','/admin/judging');
 rounds=[];request.mockReset();
 request.mockImplementation(async(path:string,options:RequestInit={})=>{
  if(path==='/api/auth/session')return {actor:{id:'admin-fixture',role:'admin'}};
  if(path==='/api/judging/admin?page=1')return {rounds:[...rounds],judges:[],catalogue,assignments:[],pageSize:25,total:0};
  if(path==='/api/judging/admin/rounds'&&options.method==='POST'){
   const data=JSON.parse(String(options.body)),created=round('created-round',data.name,data.formKey);rounds.push(created);return created;
  }
  if(path.startsWith('/api/judging/admin/entries?'))return {items:[],pageSize:25,total:0};
  throw new Error('Unexpected request '+path);
 });
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function mount(){await act(async()=>root.render(createElement(JudgeAdministration)));}
const setup=()=>host.querySelector<HTMLElement>('#review-round-setup')!;
const createForm=()=>setup().querySelector<HTMLFormElement>('form')!;
const roundSelect=()=>{
 const label=[...host.querySelectorAll('label')].find(label=>label.textContent==='Review round')!;
 return document.getElementById(label.htmlFor) as HTMLSelectElement;
};
async function fill(name:string,competition='painting'){
 await act(async()=>{
  const select=createForm().querySelector<HTMLSelectElement>('[name="formKey"]')!;select.value=competition;select.dispatchEvent(new Event('change',{bubbles:true}));
  const input=createForm().querySelector<HTMLInputElement>('[name="name"]')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,name);input.dispatchEvent(new Event('input',{bubbles:true}));
 });
}
async function create(){await act(async()=>createForm().dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));}

it('points the empty assignment selector to a labelled, focusable custom round setup panel',async()=>{
 await mount();
 expect(host.textContent).toContain('No review rounds have been created yet.');
 const link=host.querySelector<HTMLAnchorElement>('a[href="#review-round-setup"]')!;
 expect(link.textContent).toBe('Create a review round');expect(setup().tabIndex).toBe(-1);
 expect(setup().getAttribute('aria-labelledby')).toBe('review-round-setup-title');
 expect(setup().querySelector('h2')?.id).toBe('review-round-setup-title');
 expect(setup().textContent).toContain('Round 1, Round 2 or Qualifying round');
 expect(roundSelect().options).toHaveLength(1);
 expect(request.mock.calls.some(call=>call[1]?.method==='POST')).toBe(false);
});

it.each(['Round 1','Round 2','Qualifying round','Regional shortlist 2027'])('creates the custom name %s through the current judging API and refreshes the selected option',async name=>{
 await mount();await fill(name,'blog');await create();
 const sent=request.mock.calls.find(call=>call[0]==='/api/judging/admin/rounds')!;
 expect(JSON.parse(String(sent[1].body))).toEqual({formKey:'blog',name,edition:'2027',open:false});
 expect(request.mock.calls.filter(call=>call[0]==='/api/judging/admin?page=1')).toHaveLength(2);
 expect(roundSelect().value).toBe('created-round');expect(roundSelect().selectedOptions[0].textContent).toBe(`2027 · ${name} · Blog`);
 expect(host.textContent).not.toContain('No review rounds have been created yet.');
 expect(host.textContent).toContain('This round is closed; judges can save reviews after staff open it.');
 expect(createForm().querySelector<HTMLInputElement>('[name="name"]')?.value).toBe('');
});

it('keeps required competition and round-name validation and displays creation errors without adding a selectable round',async()=>{
 const implementation=request.getMockImplementation()!;
 request.mockImplementation(async(path:string,options?:RequestInit)=>{
  if(path==='/api/judging/admin/rounds')throw new ApiError('Check the round name.',{name:'Use 2 to 200 characters.'},422);
  return implementation(path,options);
 });
 await mount();
 const name=createForm().querySelector<HTMLInputElement>('[name="name"]')!,competition=createForm().querySelector<HTMLSelectElement>('[name="formKey"]')!;
 expect(name.required).toBe(true);expect(name.minLength).toBe(2);expect(name.maxLength).toBe(200);expect(competition.required).toBe(true);
 await fill('Q');await create();
 expect(host.querySelector('[role="alert"]')?.textContent).toContain('Check the round name.');expect(host.textContent).toContain('Use 2 to 200 characters.');
 expect(roundSelect().options).toHaveLength(1);expect(name.value).toBe('Q');
 expect(request.mock.calls.filter(call=>call[0]==='/api/judging/admin?page=1')).toHaveLength(1);
});

it('lets staff select either existing or newly created rounds after refresh',async()=>{
 rounds=[round('first-round','Round 1')];await mount();
 await act(async()=>{roundSelect().value='first-round';roundSelect().dispatchEvent(new Event('change',{bubbles:true}));});
 expect(roundSelect().value).toBe('first-round');
 await fill('Qualifying round');await create();
 expect([...roundSelect().options].map(option=>option.value)).toEqual(['','first-round','created-round']);
 expect(roundSelect().value).toBe('created-round');
 await act(async()=>{roundSelect().value='first-round';roundSelect().dispatchEvent(new Event('change',{bubbles:true}));});
 expect(roundSelect().selectedOptions[0].textContent).toContain('Round 1');
});

it('focuses the CMS setup anchor after data loads once, without repeating after a round is created',async()=>{
 window.history.replaceState(null,'','/admin/judging#review-round-setup');
 let callback:FrameRequestCallback|undefined;
 const animation=vi.spyOn(window,'requestAnimationFrame').mockImplementation(next=>{callback=next;return 41;});
 const cancel=vi.spyOn(window,'cancelAnimationFrame').mockImplementation(()=>{});
 const scroll=vi.spyOn(HTMLElement.prototype,'scrollIntoView').mockImplementation(()=>{});
 await mount();expect(animation).toHaveBeenCalledTimes(1);
 await act(async()=>callback!(0));
 expect(document.activeElement).toBe(setup());expect(scroll).toHaveBeenCalledWith({block:'start'});
 await fill('Qualifying round');await create();
 expect(animation).toHaveBeenCalledTimes(1);expect(scroll).toHaveBeenCalledTimes(1);expect(cancel).toHaveBeenCalledWith(41);
});

it.each(['','#other-section'])('does not move focus for an ordinary visit or unrelated anchor %s',async hash=>{
 window.history.replaceState(null,'','/admin/judging'+hash);
 const animation=vi.spyOn(window,'requestAnimationFrame');
 await mount();expect(animation).not.toHaveBeenCalled();expect(document.activeElement).not.toBe(setup());
});

it('cancels pending anchor navigation on unmount and does not override a newer hash',async()=>{
 window.history.replaceState(null,'','/admin/judging#review-round-setup');
 let callback:FrameRequestCallback|undefined;
 vi.spyOn(window,'requestAnimationFrame').mockImplementation(next=>{callback=next;return 42;});
 const cancel=vi.spyOn(window,'cancelAnimationFrame').mockImplementation(()=>{});
 const scroll=vi.spyOn(HTMLElement.prototype,'scrollIntoView').mockImplementation(()=>{});
 await mount();window.history.replaceState(null,'','/admin/judging#other-section');
 await act(async()=>callback!(0));expect(scroll).not.toHaveBeenCalled();expect(document.activeElement).not.toBe(setup());
 await act(async()=>root.render(null));expect(cancel).toHaveBeenCalledWith(42);
});
