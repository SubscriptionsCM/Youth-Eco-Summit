'use client';
import { useState } from 'react';
import { api, json, type Row } from './api';
import { Errors, Field, Notice } from './shared';
export function EmailAccount({ onSignedIn }: { onSignedIn:()=>void }) {
 const [mode,setMode]=useState<'login'|'signup'|'verify'>('login'),[email,setEmail]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState<unknown>(),[message,setMessage]=useState('');
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setError(null);
  const values=Object.fromEntries(new FormData(event.currentTarget));
  try{
   const response=await api<Row>(`/api/auth/participant/${mode}`,json('POST',{...values,contact:email}));
   if(mode==='signup'){setMode('verify');setMessage(response.message);}else onSignedIn();
  }catch(error){setError(error);}finally{setBusy(false);}
 }
 return <section className="panel"><h2>{mode==='verify'?'Verify your email':mode==='signup'?'Create your account':'Sign in to your account'}</h2><p>Use your student or educator email. Existing WordPress accounts need to be transferred before they can sign in here.</p><Errors error={error}/>{message&&<Notice>{message}</Notice>}<form className="form" onSubmit={submit}><Field name="contact" title="Email address" type="email" autoComplete="username" required value={email} onChange={(e:React.ChangeEvent<HTMLInputElement>)=>setEmail(e.target.value)}/>{mode==='verify'?<Field name="code" title="Email confirmation code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}"/>:<Field name="password" title="Password" type="password" minLength={mode==='signup'?12:1} maxLength={256} autoComplete={mode==='signup'?'new-password':'current-password'} required/>}<div className="actions"><button disabled={busy}>{busy?'Please wait…':mode==='verify'?'Verify email':mode==='signup'?'Create account':'Sign in'}</button><button type="button" className="secondary" disabled={busy} onClick={()=>{setMode(mode==='login'?'signup':'login');setError(null);setMessage('');}}>{mode==='login'?'Create a new account':'Use an existing account'}</button>{mode==='verify'&&<button type="button" className="secondary" disabled={busy} onClick={async()=>{setBusy(true);setError(null);try{await api('/api/auth/participant/resend',json('POST',{contact:email}));setMessage('A confirmation code has been requested. Check your inbox.');}catch(error){setError(error);}finally{setBusy(false);}}}>Resend confirmation code</button>}</div></form></section>;
}
