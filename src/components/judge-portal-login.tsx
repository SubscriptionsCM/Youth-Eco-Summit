'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {api,json,type Row} from './api';
import {Errors,Field,PageTitle} from './shared';
import {afterLoginPath,safeReturnPath} from './auth-navigation';

export function JudgeSignIn(){
 const [busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null);
 const [destination,setDestination]=useState<string|null>(null);
 useEffect(()=>{setDestination(safeReturnPath(new URLSearchParams(window.location.search).get('next')));},[]);
 async function signIn(event:React.FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError(null);
  const values=Object.fromEntries(new FormData(event.currentTarget));try{if(values.password!==values.confirmPassword)throw Error('The passwords must match.');const result=await api<Row>('/api/auth/login',json('POST',values));const actor=result.actor||result;
   if(!['judge','owner','admin'].includes(actor.role))throw Error('This account is not enrolled as a judge.');window.location.assign(afterLoginPath(actor.role,destination||'/judge',actor.participantKind));
  }catch(e){setError(e);setBusy(false);}
 }
 return <div className="judge-portal"><PageTitle title="Judge sign in">Welcome to the Youth Eco Summit judging portal.</PageTitle><div className="judge-login-grid"><section className="panel"><p className="judge-eyebrow">YOUR EXPERTISE. THEIR NEXT CHAPTER.</p><h2>Recognise ideas that make a difference.</h2><p>Review the work assigned to you, keep your scores saved and submit your assessment when it is ready.</p><p>Access is by staff invitation. Use your email or staff username and the password you chose when accepting your invitation.</p><Link href="/login">Participant sign in</Link></section><form className="panel form" onSubmit={signIn}><h2>Your judge account</h2><Errors error={error}/><Field name="contact" title="Judge email or username" type="text" autoComplete="username" required maxLength={254}/><Field name="password" title="Password" type="password" autoComplete="current-password" required/><Field name="confirmPassword" title="Confirm password" type="password" autoComplete="current-password" required hint="Enter the same password again."/><button disabled={busy}>{busy?'Signing in…':'Sign in to judge portal'}</button><p className="judge-help"><Link href="/recover">Recover staff access</Link></p></form></div></div>;
}
