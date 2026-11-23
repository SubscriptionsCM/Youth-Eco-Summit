'use client';
import {useEffect,useRef,useState} from 'react';
import {Notice} from './shared';

export function RegistrationDownload(){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const pending=useRef<AbortController|null>(null),objectUrl=useRef<string|null>(null);
 useEffect(()=>()=>{pending.current?.abort();if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);},[]);
 async function download(){
  if(pending.current)return;
  const controller=new AbortController();pending.current=controller;setBusy(true);setError('');setMessage('');
  try{
   const response=await fetch('/api/admin/exports?resource=registrations&format=xlsx',{credentials:'same-origin',cache:'no-store',signal:controller.signal});
   if(!response.ok){
    const data=await response.json().catch(()=>null);
    throw new Error(response.status===401?'Sign in again to download the registration sheet.':typeof data?.error==='string'?data.error:'The registration sheet could not be prepared. Please try again.');
   }
   if(!response.headers.get('Content-Type')?.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))throw new Error('The server did not return an Excel file. Please sign in again and retry.');
   const blob=await response.blob();if(controller.signal.aborted)return;
   if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);
   objectUrl.current=URL.createObjectURL(blob);
   const anchor=document.createElement('a');anchor.href=objectUrl.current;
   const filename=response.headers.get('Content-Disposition')?.match(/filename="(Youth-Eco-Summit-registrations-\d{4}-\d{2}-\d{2}\.xlsx)"/)?.[1];
   anchor.download=filename||'Youth-Eco-Summit-registrations.xlsx';document.body.append(anchor);anchor.click();anchor.remove();
   setMessage('Download started. Check your browser’s downloads for the Excel sheet.');
  }catch(error){if(!controller.signal.aborted)setError(error instanceof Error?error.message:'The download could not be completed. Please try again.');}
  finally{if(pending.current===controller){pending.current=null;if(!controller.signal.aborted)setBusy(false);}}
 }
 return <section className="panel" id="registration-download" aria-labelledby="registration-download-title">
  <h2 id="registration-download-title">Download registration sheet</h2>
  <p>Completed student, educator and school registrations, including older records, plus the school directory. Separate Excel tabs include original form details and submission dates.</p>
  <p>Includes all years; drafts are excluded. This download is not affected by the inbox filters.</p>
  <div className="actions"><button type="button" disabled={busy} onClick={download}>{busy?'Preparing registration sheet…':'Download registrations (.xlsx)'}</button></div>
  {error&&<Notice error>{error}</Notice>}{message&&<Notice>{message}</Notice>}
 </section>;
}
