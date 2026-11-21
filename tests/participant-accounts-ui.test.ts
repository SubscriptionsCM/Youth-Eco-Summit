// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const request=vi.hoisted(()=>vi.fn());
vi.mock('../src/components/api',async original=>({...await original<typeof import('../src/components/api')>(),api:request}));
import {ParticipantAccounts} from '../src/components/participant-accounts';
let host:HTMLDivElement,root:Root;
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);request.mockReset();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
it('submits only a deliberate account-type change with the prior type and credential version',async()=>{
 request.mockImplementation(async(path:string,options?:RequestInit)=>options?.method==='PATCH'?{id:'fixture',participant_kind:'student',auth_version:4}:{items:[{id:'fixture',name:'Synthetic user',contact:'fixture@example.test',participant_kind:'unclassified',auth_version:3}],total:1,page:1,pageSize:25});
 await act(async()=>root.render(createElement(ParticipantAccounts)));
 expect(host.textContent).toContain('signs that account out');expect(host.textContent).toContain('does not approve access to a school');
 const row=host.querySelector('article')!,select=row.querySelector('select')!;
 expect(row.querySelector('button')?.disabled).toBe(true);
 await act(async()=>{select.value='student';select.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(request.mock.calls.some(call=>call[1]?.method==='PATCH')).toBe(false);
 await act(async()=>row.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(request).toHaveBeenCalledWith('/api/admin/participant-accounts/fixture',expect.objectContaining({method:'PATCH',body:JSON.stringify({participantKind:'student',expectedKind:'unclassified',authVersion:3})}));
 expect(host.textContent).toContain('participant must sign in again');
 const filter=host.querySelector('select')!;await act(async()=>{filter.value='all';filter.dispatchEvent(new Event('change',{bubbles:true}));});expect(request.mock.calls.at(-1)?.[0]).toContain('kind=all');
});
it.each([401,403])('does not render account records when the server denies the list (%s)',async status=>{
 request.mockRejectedValue(new Error(`Access denied (${status})`));await act(async()=>root.render(createElement(ParticipantAccounts)));
 expect(host.textContent).toContain('Access denied');expect(host.querySelector('article')).toBeNull();
});
