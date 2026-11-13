import {afterEach,expect,it,vi} from 'vitest';
vi.mock('next/navigation',()=>({redirect:(path:string)=>{throw new Error('REDIRECT '+path);},usePathname:()=>'/admin'}));
afterEach(()=>vi.unstubAllEnvs());
it('routes the manual judging entry point to submitted forms',async()=>{
 vi.stubEnv('NEXT_PUBLIC_JUDGING_MODE','manual');
 const {default:Page}=await import('../src/app/judge/page');
 expect(()=>Page()).toThrow('REDIRECT /admin/reference-forms');
});
it('does not expose an assigned-review page in manual mode',async()=>{
 vi.stubEnv('NEXT_PUBLIC_JUDGING_MODE','manual');
 const {default:Page}=await import('../src/app/judge/[id]/page');
 await expect(Page({params:Promise.resolve({id:'assignment'})})).rejects.toThrow('REDIRECT /admin/reference-forms');
});
it('opens the forms inbox from the manual administration landing page',async()=>{
 vi.stubEnv('NEXT_PUBLIC_JUDGING_MODE','manual');
 const {default:Page}=await import('../src/app/admin/[[...section]]/page');
 await expect(Page({params:Promise.resolve({}),searchParams:Promise.resolve({})})).rejects.toThrow('REDIRECT /admin/reference-forms');
});
it('keeps existing assigned-review routes available outside manual mode',async()=>{
 vi.stubEnv('NEXT_PUBLIC_JUDGING_MODE','assigned');
 const {default:Page}=await import('../src/app/judge/[id]/page');
 expect((await Page({params:Promise.resolve({id:'assignment'})})).props.id).toBe('assignment');
});
