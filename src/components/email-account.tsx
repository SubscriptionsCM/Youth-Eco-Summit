'use client';
import { useState } from 'react';
import { api, json, type Row } from './api';
import { Errors, Field, Notice } from './shared';
export function EmailAccount({ onSignedIn }: { onSignedIn:()=>void }) {
 const [mode,setMode]=useState<'login'|'signup'|'verify'|'recover'|'reset'>('login'),[email,setEmail]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState<unknown>(),[message,setMessage]=useState('');
 const recovering=mode==='recover'||mode==='reset';
 function changeMode(next:typeof mode){setMode(next);setError(null);setMessage('');}
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setError(null);
  const values=Object.fromEntries(new FormData(event.currentTarget));
  try{
   const route=mode==='recover'?'recovery/request':mode==='reset'?'recovery/complete':mode;
   const response=await api<Row>(`/api/auth/participant/${route}`,json('POST',{...values,contact:email}));
   if(mode==='signup'){setMode('verify');setMessage(response.message);}
   else if(mode==='recover'){setMode('reset');setMessage(response.message);}
   else if(mode==='reset'){setMode('login');setMessage(response.message);}
   else onSignedIn();
  }catch(error){setError(error);}finally{setBusy(false);}
 }
 return <section className="panel">
  <h2>{mode==='reset'?'Reset your password':mode==='recover'?'Recover your participant account':mode==='verify'?'Verify your email':mode==='signup'?'Create your account':'Sign in to your account'}</h2>
  <p>{recovering?'Use your participant account email. Enter the recovery code from your email and choose a new password.':'Use your student or educator email. Existing WordPress accounts need to be transferred before they can sign in here.'}</p>
  <Errors error={error}/>{message&&<Notice>{message}</Notice>}
  <form key={mode} className="form" onSubmit={submit}>
   <Field name="contact" title="Email address" type="email" autoComplete="username" required value={email} onChange={(e:React.ChangeEvent<HTMLInputElement>)=>setEmail(e.target.value)}/>
   {(mode==='verify'||mode==='reset')&&<Field name="code" title={mode==='reset'?'Recovery code':'Email confirmation code'} required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}"/>}
   {mode!=='verify'&&mode!=='recover'&&<Field name="password" title={mode==='reset'?'New password':'Password'} type="password" minLength={mode==='login'?1:12} maxLength={256} autoComplete={mode==='login'?'current-password':'new-password'} required/>}
   <div className="actions">
    <button disabled={busy}>{busy?'Please wait…':mode==='reset'?'Reset password':mode==='recover'?'Send recovery code':mode==='verify'?'Verify email':mode==='signup'?'Create account':'Sign in'}</button>
    <button type="button" className="secondary" disabled={busy} onClick={()=>changeMode(mode==='login'?'signup':'login')}>{mode==='login'?'Create a new account':recovering?'Back to sign in':'Use an existing account'}</button>
    {mode==='login'&&<button type="button" className="secondary" disabled={busy} onClick={()=>changeMode('recover')}>Forgot your password?</button>}
    {mode==='reset'&&<button type="button" className="secondary" disabled={busy} onClick={()=>changeMode('recover')}>Request another recovery code</button>}
    {mode==='verify'&&<button type="button" className="secondary" disabled={busy} onClick={async()=>{setBusy(true);setError(null);try{await api('/api/auth/participant/resend',json('POST',{contact:email}));setMessage('A confirmation code has been requested. Check your inbox.');}catch(error){setError(error);}finally{setBusy(false);}}}>Resend confirmation code</button>}
   </div>
  </form>
 </section>;
}
