import {afterEach,expect,it,vi} from 'vitest';
import {checksumFile,retryUploadPart,runUploadRequest,UploadTimeoutError} from '../src/components/upload-request';
import {createHash} from 'node:crypto';

const hanging=(signal:AbortSignal)=>new Promise<Response>((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
afterEach(()=>vi.useRealTimers());

it('hashes large files in bounded slices with the original SHA256',async()=>{
 const bytes=new Uint8Array(9*1024*1024).fill(137),file=new Blob([bytes]);
 const slice=vi.spyOn(file,'slice'),progress=vi.fn();
 expect(await checksumFile(file,new AbortController().signal,progress)).toBe(createHash('sha256').update(bytes).digest('hex'));
 expect(slice.mock.calls).toEqual([[0,4194304],[4194304,8388608],[8388608,9437184]]);
 expect(progress.mock.calls).toEqual([[44],[89],[100]]);
});
it('stops preparation after cancellation without reading another chunk',async()=>{
 const file=new Blob([new Uint8Array(9*1024*1024)]),slice=vi.spyOn(file,'slice'),controller=new AbortController();
 await expect(checksumFile(file,controller.signal,()=>controller.abort())).rejects.toMatchObject({name:'AbortError'});
 expect(slice).toHaveBeenCalledTimes(1);
});

it('bounds a stalled request and clears its timer',async()=>{
 vi.useFakeTimers();const parent=new AbortController();let child!:AbortSignal;
 const pending=runUploadRequest(signal=>{child=signal;return hanging(signal);},parent.signal,25);
 const result=expect(pending).rejects.toBeInstanceOf(UploadTimeoutError);
 await vi.advanceTimersByTimeAsync(25);await result;
 expect(child.aborted).toBe(true);expect(parent.signal.aborted).toBe(false);expect(vi.getTimerCount()).toBe(0);
});
it('cancels an active request without leaving timeout work',async()=>{
 vi.useFakeTimers();const parent=new AbortController();const pending=runUploadRequest(hanging,parent.signal);
 const result=expect(pending).rejects.toMatchObject({name:'AbortError'});parent.abort();await result;
 expect(vi.getTimerCount()).toBe(0);
});
it('retries only transient exact-part failures, with three attempts at most',async()=>{
 vi.useFakeTimers();const send=vi.fn().mockRejectedValueOnce(new TypeError('Network unavailable')).mockResolvedValueOnce(new Response(null,{status:503})).mockResolvedValueOnce(new Response(null,{status:200}));
 const retried=vi.fn(),pending=retryUploadPart(send,new AbortController().signal,retried);
 await vi.advanceTimersByTimeAsync(1500);await pending;
 expect(send).toHaveBeenCalledTimes(3);expect(retried.mock.calls).toEqual([[2],[3]]);expect(vi.getTimerCount()).toBe(0);
});
it.each([401,403,409,422])('does not retry a permanent part failure (%s)',async status=>{
 const send=vi.fn(async()=>new Response(null,{status}));
 await expect(retryUploadPart(send,new AbortController().signal,vi.fn())).rejects.toMatchObject({status});expect(send).toHaveBeenCalledTimes(1);
});
it('stops after three part timeouts and leaves the next decision to the user',async()=>{
 vi.useFakeTimers();const send=vi.fn(hanging),pending=retryUploadPart(send,new AbortController().signal,vi.fn(),10);
 const result=expect(pending).rejects.toBeInstanceOf(UploadTimeoutError);
 await vi.advanceTimersByTimeAsync(1600);await result;expect(send).toHaveBeenCalledTimes(3);expect(vi.getTimerCount()).toBe(0);
});
it('cancels a pending retry delay without another network attempt',async()=>{
 vi.useFakeTimers();const parent=new AbortController(),send=vi.fn(async()=>new Response(null,{status:503}));
 const pending=retryUploadPart(send,parent.signal,vi.fn()),result=expect(pending).rejects.toMatchObject({name:'AbortError'});
 await vi.advanceTimersByTimeAsync(0);parent.abort();await result;
 expect(send).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
});
