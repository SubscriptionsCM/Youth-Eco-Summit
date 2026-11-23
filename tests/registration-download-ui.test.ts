// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('next/link',()=>({default:'a'}));
vi.mock('../src/components/shared',async original=>({...await original<any>(),useResource:()=>({data:null,loading:false,error:null,reload:vi.fn()})}));
import {AdminOverview} from '../src/components/admin-overview';
let host:HTMLDivElement,root:Root;
const fetchMock=vi.fn(),click=vi.fn(),create=vi.fn(()=> 'blob:private-test-export'),revoke=vi.fn();
beforeEach(()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 fetchMock.mockReset();click.mockReset();create.mockClear();revoke.mockClear();vi.stubGlobal('fetch',fetchMock);
 vi.stubGlobal('URL',class extends URL{static createObjectURL=create;static revokeObjectURL=revoke;});
 vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(click);
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
const button=()=>[...host.querySelectorAll('button')].find(element=>/Download registrations|Preparing registration sheet/.test(element.textContent||''))!;
it('provides the admin download and explains the full workbook scope before downloading',async()=>{
 await act(async()=>root.render(createElement(AdminOverview)));
 expect(button()).toBeDefined();expect(host.textContent).toContain('Completed student, educator and school registrations');expect(host.textContent).toContain('not affected by the inbox filters');
});
it('downloads a private Excel response and prevents concurrent duplicate requests',async()=>{
 let finish!:(response:Response)=>void;fetchMock.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 await act(async()=>root.render(createElement(AdminOverview)));expect(button()).toBeDefined();
 await act(async()=>button().click());expect(button().disabled).toBe(true);
 await act(async()=>button().click());expect(fetchMock).toHaveBeenCalledTimes(1);
 expect(fetchMock).toHaveBeenCalledWith('/api/admin/exports?resource=registrations&format=xlsx',expect.objectContaining({credentials:'same-origin',cache:'no-store'}));
 await act(async()=>finish(new Response(new Uint8Array([80,75]),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="Youth-Eco-Summit-registrations-2026-11-23.xlsx"'}})));
 expect(create).toHaveBeenCalledOnce();expect(click).toHaveBeenCalledOnce();expect(button().disabled).toBe(false);expect(host.textContent).toContain('Download started');
 await act(async()=>root.unmount());root=createRoot(host);expect(revoke).toHaveBeenCalledWith('blob:private-test-export');
});
it('shows a clear session or server error and never downloads an error page',async()=>{
 fetchMock.mockResolvedValue(new Response(JSON.stringify({error:'Sign in to continue.'}),{status:401,headers:{'Content-Type':'application/json'}}));
 await act(async()=>root.render(createElement(AdminOverview)));expect(button()).toBeDefined();await act(async()=>button().click());
 expect(host.querySelector('[role=alert]')?.textContent).toContain('Sign in');expect(create).not.toHaveBeenCalled();expect(button().disabled).toBe(false);
 fetchMock.mockResolvedValue(new Response('<html>Sign in</html>',{headers:{'Content-Type':'text/html'}}));
 await act(async()=>button().click());expect(host.querySelector('[role=alert]')?.textContent).toContain('Excel');expect(click).not.toHaveBeenCalled();
});
