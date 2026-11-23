'use client';
import { useEffect, useState } from 'react';
import { api, json } from './api';
import { Errors, Field, Notice, ResourceState, useResource } from './shared';
import { windowForDeadline, type ParticipationWindow } from '../data/participation-window';

type Setting={deadlineDate:string;window:ParticipationWindow;lockVersion:number;updatedAt:string|null};
export function AdminDeadline(){
 const resource=useResource<Setting>('/api/admin/participation-window');
 const [draft,setDraft]=useState(''),[confirmPast,setConfirmPast]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null),[message,setMessage]=useState('');
 useEffect(()=>{if(resource.data){setDraft(resource.data.deadlineDate);setConfirmPast(false);}},[resource.data]);
 let past=false;try{past=Date.parse(windowForDeadline(draft).closesAt)<=Date.now();}catch{}
 async function save(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(!resource.data)return;
  setBusy(true);setError(null);setMessage('');
  try{
   const saved=await api<Setting>('/api/admin/participation-window',json('PATCH',{deadlineDate:draft,lockVersion:resource.data.lockVersion,confirmPastDeadline:confirmPast}));
   resource.setData(saved);
   setMessage(`Deadline saved: ${saved.window.deadlineLabel}. The website and form checks now use this date.`);
  }catch(error){setError(error);}finally{setBusy(false);}
 }
 return <section className="panel" id="registration-deadline" aria-labelledby="registration-deadline-title">
  <h2 id="registration-deadline-title">Registration deadline</h2>
  <p>Applies to student registration and all competition submissions. The selected day stays open until 11:59 p.m. India time (IST). School and educator registration stay available.</p>
  <ResourceState {...resource} retry={resource.reload}/><Errors error={error}/>{message&&<Notice>{message}</Notice>}
  {resource.data&&<><p>Current deadline: <strong>{resource.data.window.deadlineLabel}</strong></p>
   <form className="form" onSubmit={save}>
    <Field name="deadlineDate" title="Last date for registration and submissions (IST)" type="date" required min="2026-10-01" value={draft} disabled={busy} onChange={(event:React.ChangeEvent<HTMLInputElement>)=>{setDraft(event.target.value);setConfirmPast(false);setMessage('');}}/>
    {past&&<Notice error><p>This date has passed. Saving it will close student registration and competition submissions immediately.</p><label className="check-label"><input type="checkbox" required checked={confirmPast} disabled={busy} onChange={event=>setConfirmPast(event.target.checked)}/>I intend to close registration and submissions now.</label></Notice>}
    <div className="actions"><button disabled={busy||resource.loading||!draft}>{busy?'Saving deadline…':'Save deadline'}</button><button type="button" className="secondary" disabled={busy} onClick={()=>{setError(null);setMessage('');resource.reload();}}>Reload current deadline</button></div>
   </form>
   {resource.data.updatedAt&&<p><small>Last changed: {new Date(resource.data.updatedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST. Staff changes are recorded in the activity log.</small></p>}
  </>}
 </section>;
}
