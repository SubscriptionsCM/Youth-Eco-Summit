import { expect, it, vi } from 'vitest';
import { completePortalMultipart } from '../src/server/portal-uploads';
const file={storage_key:'submissions/record/file',upload_id:'upload-1',expected_size:10,part_size:5242880};
it('recovers a completed private object when database commit failed after storage completed',async()=>{
 const store={head:vi.fn(async()=>({ContentLength:10})),parts:vi.fn(),complete:vi.fn()};
 await completePortalMultipart(store as any,file);
 expect(store.parts).not.toHaveBeenCalled();expect(store.complete).not.toHaveBeenCalled();
});
it('checks each part and completes an object that has not yet been assembled',async()=>{
 const missing=Object.assign(new Error('missing'),{name:'NotFound'});
 const parts=[{PartNumber:1,Size:10,ETag:'part-etag'}];
 const store={head:vi.fn(async()=>{throw missing;}),parts:vi.fn(async()=>parts),complete:vi.fn(async()=>({}))};
 await completePortalMultipart(store as any,file);
 expect(store.complete).toHaveBeenCalledWith(file.storage_key,file.upload_id,parts);
});
it('refuses an assembled object whose byte count does not match the draft',async()=>{
 const store={head:vi.fn(async()=>({ContentLength:11})),parts:vi.fn(),complete:vi.fn()};
 await expect(completePortalMultipart(store as any,file)).rejects.toMatchObject({status:409});
});
