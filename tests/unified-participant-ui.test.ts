// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({error:''}));
vi.mock('next/link',()=>({default:'a'}));
vi.mock('../src/components/shared',async original=>({...await original<any>(),AuthGate:({children}:any)=>children({role:'participant'}),useResource:(path:string)=>({loading:false,error:path.endsWith('/history')?state.error:'',reload:()=>{},data:{items:path.endsWith('/history')?[{id:'same-id',sourceId:'444',title:'Student registration',submissionStatus:'submitted',createdAt:'2026-11-15 08:00:00'},{id:'saved-history',sourceId:'445',title:'Contact form',submissionStatus:'draft',createdAt:'2026-11-14 08:00:00'}]:[{id:'same-id',form_key:'student',reference:'YES-ONE',status:'submitted',submitted_at:'2026-11-16T04:00:00Z'},{id:'saved-current',form_key:'student',reference:'YES-DRAFT',status:'draft',updated_at:'2026-11-17T04:00:00Z'}]}})}));
import {ReferenceDashboard} from '../src/components/reference-dashboard';
let host:HTMLDivElement,root:Root;
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;state.error='';host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const render=()=>act(async()=>root.render(createElement(ReferenceDashboard)));
const view=(name:string)=>[...host.querySelectorAll<HTMLButtonElement>('.portal-view-switch button')].find(b=>b.textContent?.startsWith(name))!;
it('shows authorized records together and keeps distinct links for colliding IDs',async()=>{
 await render();expect(host.querySelectorAll('.saved-work-card')).toHaveLength(4);
 expect(host.querySelector('a[href="/history/same-id"]')).not.toBeNull();expect(host.querySelector('a[href="/forms/student#saved=same-id"]')).not.toBeNull();
 expect(host.textContent).not.toMatch(/WordPress|previous website|earlier entries|archive/i);
 await act(async()=>view('Submitted').click());expect(host.querySelectorAll('.saved-work-card')).toHaveLength(2);
 await act(async()=>view('Drafts').click());expect(host.querySelectorAll('.saved-work-card')).toHaveLength(2);
 expect([...host.querySelectorAll('.saved-work-card a')].map(a=>a.textContent)).toEqual(expect.arrayContaining(['Continue this saved form','View form']));
});
it('does not present a partial collection as complete when one authorized reader fails',async()=>{
 state.error='Records are temporarily unavailable';await render();expect(host.querySelectorAll('.saved-work-card')).toHaveLength(0);
 expect(host.querySelector('[role=alert]')?.textContent).toContain(state.error);expect(host.querySelectorAll('.metric-value')[0].textContent).toBe('—');
});
