'use client';
import { useEffect, useState } from 'react';
import { api } from './api';
import { participationWindow, participationWindowStatus, type ParticipationWindow } from '../data/participation-window';

/** Refresh open pages when an administrator extends the deadline. The server always decides admission. */
export function useParticipationWindow(enabled=true){
 const [window,setWindow]=useState<ParticipationWindow|null>(null),[now,setNow]=useState(0),[error,setError]=useState('');
 const [managed,setManaged]=useState(false);
 useEffect(()=>{
  if(!enabled)return;
  let active=true,controller:AbortController|undefined;
  async function refresh(){
   controller?.abort();controller=new AbortController();
   try{
    const data=await api<{window:ParticipationWindow;managed:boolean}>('/api/public/participation-window',{signal:controller.signal});
    if(active){setWindow(data.window);setManaged(data.managed);setNow(Date.now());setError('');}
   }catch(error){if(active&&(error as Error).name!=='AbortError')setError('The current deadline could not be checked. Please refresh before submitting.');}
  }
  const visible=()=>{if(!document.hidden)void refresh();};
  void refresh();
  const timer=setInterval(()=>{setNow(Date.now());if(!document.hidden)void refresh();},30_000);
  addEventListener('focus',visible);document.addEventListener('visibilitychange',visible);
  return()=>{active=false;controller?.abort();clearInterval(timer);removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible);};
 },[enabled]);
 useEffect(()=>{
  if(!window)return;
  const boundary=Date.parse(now<Date.parse(window.opensAt)?window.opensAt:window.closesAt),delay=boundary-Date.now()+1;
  if(delay<=0)return;
  const timer=setTimeout(()=>setNow(Date.now()),Math.min(delay,2_147_483_000));
  return()=>clearTimeout(timer);
 },[window,now]);
 return {window:window||participationWindow,managed,status:window&&now&&!error?participationWindowStatus(now,window):null,error};
}

