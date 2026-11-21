'use client';
import { useState } from 'react';
import { api, json, type Row } from './api';
import { Errors, Field, Notice } from './shared';
type SignedInAccount = { email: string; username?: string };
type PendingRegistration = { username: string; formKey: 'student'|'teacher'|'school'; password: string };
export function EmailAccount({ onSignedIn, provider = 'native', registrationForm }: { onSignedIn:(account?:SignedInAccount)=>void|Promise<void>; provider?:'supabase'|'wordpress'|'native'; registrationForm?:'student'|'teacher'|'school' }) {
 const [mode,setMode]=useState<'login'|'signup'|'verify'|'recover'|'reset'>('login'),[email,setEmail]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState<unknown>(),[message,setMessage]=useState('');
 const [pendingRegistration,setPendingRegistration]=useState<PendingRegistration|null>(null);
 const namedAccounts=provider==='wordpress'||provider==='native';
 const requiresConfirmation=mode==='signup'||mode==='reset'||(mode==='login'&&provider!=='native');
 const recovering=mode==='recover'||mode==='reset';
 const creating=mode==='signup'||mode==='verify';
 function changeMode(next:typeof mode){setMode(next);setError(null);setMessage('');setPendingRegistration(null);}
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setError(null);
  const values=Object.fromEntries(new FormData(event.currentTarget));
  try{
   if(requiresConfirmation&&values.password!==values.confirmPassword)throw new Error('The passwords must match.');
   const route=mode==='recover'?'recovery/request':mode==='reset'?'recovery/complete':mode;
   let payload:Row={...values,contact:email},pending:PendingRegistration|null=null;
   if(namedAccounts&&mode==='signup'){
    const password=String(values.password||'');
    if(password!==values.confirmPassword)throw new Error('The passwords must match.');
    pending={username:String(values.username||'').trim(),formKey:registrationForm||(['teacher','school'].includes(String(values.formKey))?values.formKey as 'teacher'|'school':'student'),password};
    payload={contact:email.trim().toLowerCase(),username:pending.username,formKey:pending.formKey};
   }
   if(namedAccounts&&mode==='verify'){
    if(!pendingRegistration)throw new Error('Start account registration again to choose your password and verify your email.');
    payload={contact:email,username:pendingRegistration.username,formKey:pendingRegistration.formKey,code:values.code,password:pendingRegistration.password};
   }
   const response=await api<Row>(`/api/auth/participant/${route}`,json('POST',payload));
   if(mode==='signup'){setPendingRegistration(pending);if(namedAccounts)setEmail(email.trim().toLowerCase());setMode('verify');setMessage(response.message);}
   else if(mode==='recover'){setMode(response.recovery==='link'?'login':'reset');setMessage(response.message);}
   else if(mode==='reset'){setMode('login');setMessage(response.message);}
   else {
    setPendingRegistration(null);
    await onSignedIn(namedAccounts?{email:response.actor?.contact||email,...mode==='verify'&&pendingRegistration?{username:pendingRegistration.username}:{}}:undefined);
    window.dispatchEvent(new Event('yes-auth-changed'));
   }
  }catch(error){setError(error);}finally{setBusy(false);}
 }
 return <section className="panel">
  <h2>{mode==='reset'?'Reset your password':mode==='recover'?'Recover your participant account':mode==='verify'?'Verify your email':mode==='signup'?'Create your account':'Sign in to your account'}</h2>
  <p>{namedAccounts?creating?'Choose your registration username, email and password. Verify the emailed code in this browser to create your account.':recovering?provider==='native'?'Use your username or email. Enter the emailed recovery code and choose a new password.':'Use your username or email. Follow the password-reset link in your email, then return here to sign in.':'Use your existing username or email and password.':recovering?'Use your participant account email. Enter the recovery code from your email and choose a new password.':'Use your student or educator email. Existing accounts need to be transferred before they can sign in here.'}</p>
  <Errors error={error}/>{message&&<Notice>{message}</Notice>}
  <form key={mode} className="form" onSubmit={submit}>
   {namedAccounts&&mode==='signup'&&<>
    {!registrationForm&&<Field name="formKey" title="Registration type"><select name="formKey" defaultValue="student"><option value="student">Student</option><option value="teacher">Educator</option><option value="school">School representative</option></select></Field>}
    <Field name="username" title={registrationForm==='teacher'?'Your Name (Username)':'Name (Username)'} autoComplete="username" maxLength={60} required/>
   </>}
   <Field name="contact" title={namedAccounts&&!creating?'Username or email':'Email address'} type={namedAccounts&&!creating?'text':'email'} autoComplete="username" required value={email} readOnly={namedAccounts&&mode==='verify'} onChange={(e:React.ChangeEvent<HTMLInputElement>)=>setEmail(e.target.value)}/>
   {(mode==='verify'||mode==='reset')&&<Field name="code" title={mode==='reset'?'Recovery code':'Email confirmation code'} required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}"/>}
   {mode!=='verify'&&mode!=='recover'&&<Field name="password" title={mode==='reset'?'New password':'Password'} type="password" minLength={provider==='wordpress'||mode==='login'?1:12} maxLength={provider==='wordpress'||mode==='login'?4096:256} autoComplete={mode==='login'?'current-password':'new-password'} required/>}
   {requiresConfirmation&&<Field name="confirmPassword" title={mode==='reset'?'Confirm new password':'Confirm password'} type="password" minLength={1} maxLength={provider==='wordpress'?4096:256} autoComplete="new-password" required hint="Enter the same password again."/>}
   <div className="actions">
    <button disabled={busy}>{busy?'Please wait…':mode==='reset'?'Reset password':mode==='recover'?provider==='wordpress'?'Send reset link':'Send recovery code':mode==='verify'?'Verify email':mode==='signup'?'Create account':'Sign in'}</button>
    <button type="button" className="secondary" disabled={busy} onClick={()=>changeMode(mode==='login'?'signup':'login')}>{mode==='login'?'Create a new account':recovering?'Back to sign in':'Use an existing account'}</button>
    {mode==='login'&&<button type="button" className="secondary" disabled={busy} onClick={()=>changeMode('recover')}>Forgot your password?</button>}
    {mode==='reset'&&<button type="button" className="secondary" disabled={busy} onClick={()=>changeMode('recover')}>Request another recovery code</button>}
    {mode==='verify'&&<button type="button" className="secondary" disabled={busy} onClick={async()=>{setBusy(true);setError(null);try{await api('/api/auth/participant/resend',json('POST',{contact:email,...namedAccounts&&pendingRegistration?{username:pendingRegistration.username,formKey:pendingRegistration.formKey}:{}}));setMessage('A confirmation code has been requested. Check your inbox.');}catch(error){setError(error);}finally{setBusy(false);}}}>Resend confirmation code</button>}
   </div>
  </form>
 </section>;
}
