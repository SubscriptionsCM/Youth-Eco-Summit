import {afterEach,expect,it,vi} from 'vitest';
import {safeReturnPath} from '../src/components/auth-navigation';
vi.mock('next/navigation',()=>({redirect:(path:string)=>{throw new Error('REDIRECT '+path);},usePathname:()=>'/judge'}));
afterEach(()=>vi.unstubAllEnvs());
it('does not return a successful sign-in to the judge login form',()=>{
 expect(safeReturnPath('/judge/login')).toBeNull();
});
it('opens the dedicated portal in portal mode instead of redirecting to administration',async()=>{
 vi.stubEnv('NEXT_PUBLIC_JUDGING_MODE','portal');const {default:Page}=await import('../src/app/judge/page');
 expect(Page().type.name).toBe('DedicatedJudgePage');
});
it('opens source-linked assignment reviews in portal mode',async()=>{
 vi.stubEnv('NEXT_PUBLIC_JUDGING_MODE','portal');const {default:Page}=await import('../src/app/judge/[id]/page');const view=await Page({params:Promise.resolve({id:'assignment'})});
 expect(view.type.name).toBe('DedicatedJudgePage');expect(view.props.id).toBe('assignment');
});
it('provides a dedicated judge sign-in route',async()=>{
 const {default:Page}=await import('../src/app/judge/login/page');expect(Page().type.name).toBe('JudgeSignIn');
});
it('opens staff judging management while preserving the manual staff inbox',async()=>{
 vi.stubEnv('NEXT_PUBLIC_JUDGING_MODE','manual');const {default:Page}=await import('../src/app/admin/[[...section]]/page');
 const view=await Page({params:Promise.resolve({section:['judging']}),searchParams:Promise.resolve({})});expect(view.type.name).toBe('JudgeAdministration');
});
