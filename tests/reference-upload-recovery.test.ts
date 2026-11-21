// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('next/link',()=>({default:'a'}));
const request=vi.hoisted(()=>vi.fn());
vi.mock('../src/components/api',async original=>({...await original<typeof import('../src/components/api')>(),api:request}));
import {ReferenceControl} from '../src/components/reference-form';

let host:HTMLDivElement,root:Root;
const refresh=vi.fn(async()=>{}),transfer=vi.fn();
const field={id:'upload-yes-1',type:'upload',field_label:'Short film',required:'true',filetypes:['mp4']};
beforeEach(()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('fetch',transfer);vi.stubGlobal('crypto',{subtle:{digest:async()=>new Uint8Array(32).buffer}});
 request.mockReset();transfer.mockReset();refresh.mockClear();
 request.mockImplementation(async(path:string,options:{body?:string})=>path.endsWith('/begin')?{id:'retained-file',partSize:3,status:'pending'}:path.endsWith('/part')?{url:`https://portal.test/part/${JSON.parse(options.body!).partNumber}`}:{status:'uploaded'});
 transfer.mockResolvedValue(new Response(null,{status:200}));
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();vi.unstubAllGlobals();});
async function mount(){await act(async()=>root.render(createElement(ReferenceControl,{field,record:{id:'draft',files:[]},answers:{},change:vi.fn(),formKey:'short-film-making',token:'',refresh})));}
async function select(){
 const file=new File(['video123'],'synthetic.mp4',{type:'video/mp4'});
 Object.defineProperty(file,'arrayBuffer',{value:async()=>new TextEncoder().encode('video123').buffer});
 const input=host.querySelector<HTMLInputElement>('input[type=file]')!;
 Object.defineProperty(input,'files',{configurable:true,value:[file]});
 let selectedValue='C:\\fakepath\\synthetic.mp4';Object.defineProperty(input,'value',{configurable:true,get:()=>selectedValue,set:value=>{selectedValue=value;}});
 await act(async()=>{input.dispatchEvent(new Event('change',{bubbles:true}));});
 return input;
}
const hanging=(_url:string,options:RequestInit)=>new Promise<Response>((_resolve,reject)=>options.signal!.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));

it('uploads every part and clears the selection so the same file can be selected again',async()=>{
 await mount();const input=await select();
 expect(input.value).toBe('');expect(input.disabled).toBe(false);expect(transfer.mock.calls.map(call=>call[0])).toEqual(['https://portal.test/part/1','https://portal.test/part/2','https://portal.test/part/3']);
 expect(transfer.mock.calls.map(call=>(call[1].body as Blob).size)).toEqual([3,3,2]);expect(refresh).toHaveBeenCalledTimes(1);expect(refresh.mock.calls[0]).toHaveLength(1);
 await select();expect(transfer).toHaveBeenCalledTimes(6);
});
it('lets the user cancel a stalled PUT and retry the retained file without choosing it again',async()=>{
 transfer.mockImplementationOnce(hanging);await mount();const input=await select();expect(input.disabled).toBe(true);
 const signal=transfer.mock.calls[0][1].signal as AbortSignal;
 await act(async()=>[...host.querySelectorAll('button')].find(button=>button.textContent==='Cancel upload')!.click());
 expect(signal.aborted).toBe(true);expect(input.disabled).toBe(false);expect(request.mock.calls.some(call=>call[0].endsWith('/complete'))).toBe(false);
 await act(async()=>[...host.querySelectorAll('button')].find(button=>button.textContent==='Retry upload')!.click());
 expect(transfer).toHaveBeenCalledTimes(4);expect(request.mock.calls.filter(call=>call[0].endsWith('/begin'))).toHaveLength(2);expect(request.mock.calls.filter(call=>call[0].endsWith('/complete'))).toHaveLength(1);
 expect(host.textContent).toContain('Upload received');
});
it('gets a fresh signed URL and repeats only the same part after a transient failure',async()=>{
 vi.useFakeTimers();transfer.mockRejectedValueOnce(new TypeError('Connection lost'));await mount();await select();
 await act(async()=>vi.advanceTimersByTimeAsync(500));
 expect(transfer.mock.calls.map(call=>call[0])).toEqual(['https://portal.test/part/1','https://portal.test/part/1','https://portal.test/part/2','https://portal.test/part/3']);
 expect(transfer.mock.calls.map(call=>(call[1].body as Blob).size)).toEqual([3,3,3,2]);expect(request.mock.calls.filter(call=>call[0].endsWith('/begin'))).toHaveLength(1);expect(request.mock.calls.filter(call=>call[0].endsWith('/complete'))).toHaveLength(1);
 expect(vi.getTimerCount()).toBe(0);
});
it('times out a stalled begin request without automatically repeating it',async()=>{
 vi.useFakeTimers();request.mockImplementationOnce((_path,options)=>new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true})));
 await mount();const input=await select();
 await act(async()=>vi.advanceTimersByTimeAsync(30000));
 expect(input.disabled).toBe(false);expect(request).toHaveBeenCalledTimes(1);expect(transfer).not.toHaveBeenCalled();expect(host.textContent).toContain('took too long');expect(host.textContent).toContain('Retry upload');expect(vi.getTimerCount()).toBe(0);
});
it('aborts the current transfer and clears its timer when its field unmounts',async()=>{
 vi.useFakeTimers();transfer.mockImplementationOnce(hanging);await mount();await select();
 const signal=transfer.mock.calls[0][1].signal as AbortSignal;
 await act(async()=>root.render(null));expect(signal.aborted).toBe(true);expect(vi.getTimerCount()).toBe(0);expect(refresh).not.toHaveBeenCalled();
});
