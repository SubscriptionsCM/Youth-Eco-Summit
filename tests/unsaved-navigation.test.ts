// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {useUnsavedNavigation} from '../src/components/unsaved-navigation';
it('protects unsaved edits during internal navigation while allowing downloads and new tabs',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;let dirty=true;
 function Page(){useUnsavedNavigation(()=>dirty);return null;}
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host),originalConfirm=window.confirm,confirm=vi.fn(()=>false);Object.defineProperty(window,'confirm',{value:confirm,writable:true,configurable:true});
 const click=(href:string,target='')=>{const a=document.createElement('a');a.href=href;a.target=target;host.append(a);let guarded=true;a.addEventListener('click',e=>{guarded=e.defaultPrevented;e.preventDefault();});const e=new MouseEvent('click',{bubbles:true,cancelable:true,button:0});a.dispatchEvent(e);a.remove();return guarded;};
 try{
  await act(async()=>root.render(createElement(Page)));
  expect(click('/dashboard')).toBe(true);expect(confirm).toHaveBeenCalledTimes(1);
  expect(click('/api/judging/assignments/file')).toBe(false);expect(click('/competitions','_blank')).toBe(false);expect(confirm).toHaveBeenCalledTimes(1);
  const unload=new Event('beforeunload',{cancelable:true});window.dispatchEvent(unload);expect(unload.defaultPrevented).toBe(true);
  dirty=false;expect(click('/dashboard')).toBe(false);
 }finally{await act(async()=>root.unmount());host.remove();if(originalConfirm)window.confirm=originalConfirm;else delete (window as any).confirm;}
});
