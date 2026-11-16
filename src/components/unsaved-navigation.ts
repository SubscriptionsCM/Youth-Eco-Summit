'use client';
import {useEffect,useRef} from 'react';

/** Protect client-side links as well as browser reloads; downloads remain usable. */
export function useUnsavedNavigation(check:()=>boolean){
 const current=useRef(check);current.current=check;
 useEffect(()=>{
  let approved=false,timer:ReturnType<typeof setTimeout>|undefined;
  const unload=(event:BeforeUnloadEvent)=>{if(current.current()&&!approved){event.preventDefault();event.returnValue='';}};
  const navigate=(event:MouseEvent)=>{
   if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||!current.current())return;
   const anchor=event.target instanceof Element?event.target.closest('a[href]'):null;
   if(!(anchor instanceof HTMLAnchorElement)||anchor.hasAttribute('download')||(anchor.target&&anchor.target!=='_self'))return;
   const url=new URL(anchor.href,window.location.href);
   if(url.origin!==window.location.origin||url.pathname.startsWith('/api/')||(url.pathname===window.location.pathname&&url.search===window.location.search))return;
   if(!window.confirm('You have unsaved changes. Leave this page without saving?')){event.preventDefault();event.stopPropagation();return;}
   approved=true;clearTimeout(timer);timer=setTimeout(()=>{approved=false;},1000);
  };
  document.addEventListener('click',navigate,true);window.addEventListener('beforeunload',unload);
  return()=>{clearTimeout(timer);document.removeEventListener('click',navigate,true);window.removeEventListener('beforeunload',unload);};
 },[]);
}
