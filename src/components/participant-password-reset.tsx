'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api, json } from './api';
import { Errors, Field, Notice, PageTitle } from './shared';

type ResetContext={contact:string;key:string};
export function participantResetContext(fragment:string):ResetContext|null {
 const params=new URLSearchParams(fragment.replace(/^#/,''));
 if([...params.keys()].length!==2||params.getAll('key').length!==1||params.getAll('login').length!==1)return null;
 const key=params.get('key')||'',contact=params.get('login')||'';
 if(!/^[a-z0-9]{1,256}$/i.test(key)||!contact||contact.length>60||/[\u0000-\u001f\u007f]/.test(contact))return null;
 return {contact,key};
}

export function ParticipantPasswordReset(){
 const [context,setContext]=useState<ResetContext|null>(),[busy,setBusy]=useState(false),[done,setDone]=useState(false),[error,setError]=useState<unknown>();
 const initialized=useRef(false);
 useEffect(()=>{
  if(initialized.current)return;initialized.current=true;
  const parsed=participantResetContext(window.location.hash);
  window.history.replaceState(window.history.state,'',window.location.pathname);
  setContext(parsed);
 },[]);
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(!context)return;setBusy(true);setError(null);
  const values=Object.fromEntries(new FormData(event.currentTarget));
  try{
   if(values.password!==values.confirmPassword)throw new Error('The passwords must match.');
   await api('/api/auth/participant/recovery/complete',json('POST',{...context,password:values.password,confirmPassword:values.confirmPassword}));
   setContext(null);setDone(true);
  }catch(error){setError(error);}finally{setBusy(false);}
 }
 return <><PageTitle title="Reset your password">Choose a new password for your participant account.</PageTitle>
  {done?<Notice>Password updated. <Link href="/login">Sign in with your new password</Link>.</Notice>:context===undefined?<p role="status">Preparing password reset…</p>:!context?<Notice error>Open the complete reset link from your email, or <Link href="/login">return to sign in and request a new link</Link>.</Notice>:<section className="panel"><p>Use a strong, unique password: 8–30 characters with uppercase and lowercase letters and a number. Avoid backslashes. This link can be used once.</p><Errors error={error}/><form className="form" onSubmit={submit}><Field name="password" title="New password" type="password" autoComplete="new-password" required minLength={1} maxLength={4096}/><Field name="confirmPassword" title="Confirm new password" type="password" autoComplete="new-password" required minLength={1} maxLength={4096}/><button disabled={busy}>{busy?'Updating…':'Update password'}</button></form><p><Link href="/login">Back to sign in</Link></p></section>}
 </>;
}
