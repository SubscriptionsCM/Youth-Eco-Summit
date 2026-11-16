// @vitest-environment happy-dom
import {act,createElement,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
const session=vi.hoisted(()=>({read:vi.fn()}));
vi.mock('next/navigation',()=>({usePathname:()=>'/dashboard'}));
vi.mock('next/link',()=>({default:'a'}));
vi.mock('next/image',()=>({default:()=>null}));
vi.mock('../src/components/header-socials',()=>({HeaderSocials:()=>null}));
vi.mock('../src/components/api',()=>({api:session.read,json:()=>({})}));
import {SiteShell} from '../src/components/site-shell';
it('preserves unsaved page state when the session loads or a focus refresh fails',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 let ready!:(value:unknown)=>void,mounts=0;session.read.mockImplementationOnce(()=>new Promise(resolve=>{ready=resolve;}));
 function Draft(){const [edits,setEdits]=useState(0);useEffect(()=>{mounts++;},[]);return createElement('button',{'data-draft':true,onClick:()=>setEdits(n=>n+1)},`Unsaved changes ${edits}`);}
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(createElement(SiteShell,{children:createElement(Draft)})));expect(mounts).toBe(1);
  await act(async()=>ready({actor:{id:'qa',role:'participant'}}));expect(mounts).toBe(1);
  await act(async()=>host.querySelector<HTMLButtonElement>('[data-draft]')!.click());expect(host.textContent).toContain('Unsaved changes 1');
  session.read.mockRejectedValueOnce(new Error('Connection interrupted'));
  await act(async()=>window.dispatchEvent(new Event('focus')));expect(mounts).toBe(1);expect(host.textContent).toContain('Unsaved changes 1');
 }finally{await act(async()=>root.unmount());host.remove();}
});
