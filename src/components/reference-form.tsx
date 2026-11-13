'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError, json, type Row } from './api';
import { Errors, Field, Notice, PageTitle, ResourceState, useResource } from './shared';
import { FormSteps } from './form-steps';
import { SchoolAutocomplete } from './registration';
import { EmailAccount } from './email-account';
import { RetainedFileDownload, RetainedFormFiles } from './retained-form-files';
import { enabled, fieldLabel, fieldOptions, formSteps, formTitle, isFieldVisible, plainText, referenceForms, validateReferenceAnswers, type Answers, type ReferenceField } from '../domain/wordpress-forms';
import { SubmittedFormAnswers } from './submitted-form-answers';
import { loadSubmittedRecord, pendingSubmittedRecord } from './reference-receipt';
import {displayReferenceValue,nameParts} from '../domain/reference-values';
import './reference-form.css';

export function ReferenceFormPage({formKey,initialAnswers={}}:{formKey:string;initialAnswers?:Answers}) {
 const form=referenceForms.find(f=>f.key===formKey);
 const configuration=useResource<Row>('/api/forms/config'),session=useResource<Row>('/api/auth/session');
 const [record,setRecord]=useState<Row|null>(null),[answers,setAnswers]=useState<Answers>(initialAnswers),[token,setToken]=useState(''),[step,setStep]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState<unknown>(),[message,setMessage]=useState(''),[fieldErrors,setFieldErrors]=useState<Record<string,string>>({});
 const loaded=useRef(false),heading=useRef<HTMLHeadingElement>(null),dirty=useRef(false);
 function headers(key=token):Record<string,string>{return key?{'X-Draft-Key':key}:{};}
 useEffect(()=>{
  if(loaded.current)return;loaded.current=true;
  const saved=new URLSearchParams(window.location.hash.slice(1)).get('saved');
  if(!saved)return;
  const [id,key='']=saved.split('.');setToken(key);setBusy(true);
  api<Row>(`/api/forms/records/${encodeURIComponent(id)}`,{headers:headers(key)}).then(data=>{if(data.form_key!==formKey)throw new Error('This saved link belongs to a different form. Open its original page.');setRecord(data);setAnswers(data.answers);setStep(data.current_step);}).catch(setError).finally(()=>setBusy(false));
 },[formKey]);
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(dirty.current){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[]);
 useEffect(()=>{
  if(!record?.files?.some((f:Row)=>['uploaded','pending'].includes(f.status)&&!f.verification_failed))return;
  const timer=setInterval(()=>{void refresh().catch(setError);},4000);return()=>clearInterval(timer);
 },[record?.id,record?.files,token]);
 async function refresh(){if(!record)return;const data=await api<Row>(`/api/forms/records/${record.id}`,{headers:headers()});setRecord(previous=>({...previous,files:data.files}));}
 if(!form)return <Notice error>This form is not available.</Notice>;
 const steps=formSteps(form),actor=session.data?.actor,needsAccount=form.competition||['student','teacher'].includes(form.key);
 function change(key:string,value:unknown){dirty.current=true;setAnswers(previous=>({...previous,[key]:value}));setMessage('');setFieldErrors(previous=>{const next={...previous};delete next[key];return next;});}
 async function begin(){setBusy(true);setError(null);try{const data=await api<Row>('/api/forms/records',json('POST',{formKey,context:initialAnswers}));setRecord(data.record);setToken(data.token||'');window.history.replaceState(null,'',`${window.location.pathname}${window.location.search}#saved=${data.record.id}${data.token?'.'+data.token:''}`);}catch(error){setError(error);}finally{setBusy(false);}}
 async function save(next=step,validate=false){
  if(!record||!form)return;
  if(validate){const checked=validateReferenceAnswers(form,answers,{final:true,step});if(Object.keys(checked.errors).length){setFieldErrors(checked.errors);setError(new Error('Complete the required information before continuing.'));return;}}
  setBusy(true);setError(null);
  try{const saved=await api<Row>(`/api/forms/records/${record.id}`,{...json('PUT',{answers,currentStep:next,lockVersion:record.lock_version}),headers:headers()});setRecord({...record,...saved});setStep(next);dirty.current=false;setMessage('Your progress is saved. Keep the private link to continue later.');requestAnimationFrame(()=>heading.current?.focus());}catch(error){setError(error);}finally{setBusy(false);}
 }
 async function submit(){
  if(!record)return;setBusy(true);setError(null);setFieldErrors({});
  try{const receipt=await api<Row>(`/api/forms/records/${record.id}/submit`,{...json('POST',{answers,lockVersion:record.lock_version}),headers:headers()});setRecord(pendingSubmittedRecord(record,receipt));dirty.current=false;setMessage('Your submission has been received.');setRecord(await loadSubmittedRecord(record,receipt,()=>api<Row>(`/api/forms/records/${record.id}`,{headers:headers()})));}
  catch(error){setError(error);if(error instanceof ApiError)setFieldErrors(error.fields||{});}finally{setBusy(false);}
 }
 return <><PageTitle title={formTitle(form)}>{form.competition?'Complete the student details, prepare your work, then review and submit.':'Complete the form below. Your progress can be saved for later.'}</PageTitle><ResourceState {...configuration} retry={configuration.reload}/><Errors error={error}/>{message&&<Notice>{message}</Notice>}{configuration.data&&!configuration.data.enabled?<Notice>Registration is being prepared on this website. Continue at <a href="https://youthecosummit.com/">youthecosummit.com</a>.</Notice>:configuration.data&&<>
 {needsAccount&&!actor?<EmailAccount provider={configuration.data?.accountProvider === 'wordpress' ? 'wordpress' : 'supabase'} registrationForm={formKey === 'student' || formKey === 'teacher' ? formKey : undefined} onSignedIn={account=>{if(account && (formKey === 'student' || formKey === 'teacher'))setAnswers(previous=>({...previous,'email-1':previous['email-1']||account.email,...account.username?{'text-1':previous['text-1']||account.username}:{}}));session.reload();}}/>:!record?<section className="panel"><h2>Before you begin</h2><p>{needsAccount?'Have your registered school ID and the required contact details ready.':'Have your contact details and the requested information ready.'} Save the private link before leaving.</p>{form.competition&&<p>Submitting as: <strong>{String(initialAnswers['hidden-yes-submitter']||'student')}</strong> · {String(initialAnswers['radio-yes-entry-mode']||'individual')}</p>}<button onClick={begin} disabled={busy}>{busy?'Opening…':'Start form'}</button></section>:record.status==='submitted'?<section className="receipt" role="status"><h2>Submission received</h2><p>Reference: <strong>{record.reference}</strong></p><p>Submitted: {new Date(record.receipt?.submittedAt||record.submitted_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST</p>{record.receipt?.schoolStatus==='pending'&&(record.current_school_status==='active'?<p>Your school registration is approved. Its permanent ID is available in the <Link href="/schools">school directory</Link>.</p>:record.current_school_status==='inactive'?<p>Your school registration is currently inactive. Contact the summit team for help.</p>:<p>Your school registration is pending review. Use its permanent ID after approval.</p>)}<SubmittedFormAnswers form={form} record={record}/><RetainedFormFiles files={record.files} token={token}/><Link href="/dashboard">View your account</Link></section>:<div className="reference-form"><FormSteps steps={steps.map(step=>step.label)} current={step}/><h2 ref={heading} tabIndex={-1}>{steps[step]?.label}</h2><p>Your progress is saved at each step. Review your details before submitting.</p><form className="form panel" onSubmit={event=>{event.preventDefault();void (step<steps.length-1?save(step+1,true):submit());}}><fieldset disabled={busy} className="reference-fieldset"><legend className="sr-only">{steps[step]?.label}</legend>{steps[step]?.fields.filter(field=>isFieldVisible(field,answers)).map(field=><ReferenceControl key={field.id} field={field} answers={answers} change={change} formKey={formKey} record={record} token={token} refresh={refresh} error={fieldErrors[field.id]||fieldErrors['registered-school-id']}/>)}</fieldset>{step===steps.length-1&&steps.length>1&&<details><summary>Review your saved information</summary><dl>{form.fields.filter(field=>!['html','group','page-break','hidden','password','upload','consent'].includes(field.type)&&isFieldVisible(field,answers)&&answers[field.id]!==undefined).map(field=><div key={field.id}><dt>{fieldLabel(field,answers)}</dt><dd>{displayReferenceValue(field.type,answers[field.id])}</dd></div>)}</dl></details>}{fieldErrors._form&&<Notice error>{fieldErrors._form}</Notice>}<div className="actions">{step>0&&<button type="button" className="secondary" disabled={busy} onClick={()=>save(step-1)}>Previous</button>}<button type="button" className="secondary" disabled={busy} onClick={()=>save()}>Save and continue later</button><button disabled={busy}>{busy?'Saving…':step<steps.length-1?'Save and continue':form.settings.submitData?.['custom-submit-text']||'Submit'}</button></div></form><div className="actions"><button type="button" className="secondary" onClick={async()=>{try{await navigator.clipboard.writeText(window.location.href);setMessage('Private saved-form link copied. Keep it safe.');}catch{setMessage('Copy the private link from your browser address bar.');}}}>Copy link to saved form</button><Link href="/dashboard">Continue a saved entry from your account</Link></div></div>}
 </>}</>;
}

export function ReferenceControl({field,answers,change,formKey,record,token,refresh,error}:{field:ReferenceField;answers:Answers;change:(key:string,value:unknown)=>void;formKey:string;record:Row;token:string;refresh:()=>Promise<void>;error?:string}) {
 const label=fieldLabel(field,answers),value=answers[field.id],options=fieldOptions(field),required=enabled(field.required);
 const common={id:field.id,name:field.id,required,'aria-invalid':!!error,'aria-describedby':error?`${field.id}-error`:undefined};
 if(['hidden','group','password'].includes(field.type))return null;
 if(field.type==='section')return <section><h3>{label}</h3><p>{plainText(field.description)}</p></section>;
 if(field.type==='html')return <p className="reference-guidance">{plainText(field.variations).replace(answers['radio-yes-entry-mode']!=='team'?/Student 1\b/:/$^/,'Student')}</p>;
 if(field.type==='upload')return <ReferenceUpload field={field} record={record} token={token} refresh={refresh}/>;
 if(field.type==='name'&&enabled(field.multiple_name)){
  const values=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:typeof value==='string'?{'first-name':value}:{};
  return <fieldset><legend>{label}</legend><div className="name-parts">{nameParts(field).map(part=><Field key={part.key} name={`${field.id}-${part.key}`} title={part.label} required={part.required} autoComplete={part.autocomplete} maxLength={1000} value={typeof values[part.key]==='string'?values[part.key]:''} aria-invalid={!!error} aria-describedby={error?`${field.id}-error`:undefined} onChange={(event:React.ChangeEvent<HTMLInputElement>)=>change(field.id,{...values,[part.key]:event.target.value})}/>)}</div>{error&&<p id={`${field.id}-error`} role="alert">{error}</p>}</fieldset>;
 }
 if(field.catalogue&&['student','teacher'].includes(formKey)||field.id==='text-yes-school-id')return <div className="field"><label>{label}{required?' *':''}</label><SchoolAutocomplete onSelect={school=>{change(field.id,field.id==='text-yes-school-id'?school.reference:school.name);change('registered-school-id',school.reference);change('text-yes-school',`${school.name}, ${school.address}, ${school.city}`);}}/>{Boolean(value)&&<p role="status">Selected: {String(value)} {String(answers['registered-school-id']||'')}</p>}{error&&<p role="alert">{error}</p>}</div>;
 if(field.type==='address')return <fieldset><legend>{label}</legend>{['street_address','address_line','address_city','address_state','address_zip','address_country'].filter(part=>enabled(field[part])).map(part=><Field key={part} name={`${field.id}-${part}`} title={field[`${part}_label`]||part} required={enabled(field[`${part}_required`])} value={String((value as Record<string,unknown>)?.[part]||'')} onChange={(event:React.ChangeEvent<HTMLInputElement>)=>change(field.id,{...(value as object||{}),[part]:event.target.value})}/>)}{error&&<p role="alert">{error}</p>}</fieldset>;
 if(field.type==='consent')return <div className="field"><label className="check-label"><input {...common} type="checkbox" checked={value===true} onChange={event=>change(field.id,event.target.checked)}/>{plainText(field.consent_description)||label}{required?' *':''}</label>{error&&<p role="alert">{error}</p>}</div>;
 if(field.type==='radio')return <fieldset><legend>{label}{required?' *':''}</legend>{options.map(option=><label className="check-label" key={option.value}><input name={field.id} type="radio" value={option.value} checked={value===option.value} required={required} onChange={()=>change(field.id,option.value)}/>{option.label}</label>)}{error&&<p role="alert">{error}</p>}</fieldset>;
 const multiple=field.value_type==='multiselect';
 return <Field name={field.id} title={label} required={required} hint={plainText(field.description)}>{field.type==='textarea'?<textarea {...common} value={String(value||'')} maxLength={20000} onChange={event=>change(field.id,event.target.value)}/>:field.catalogue?<><input {...common} list={`${field.id}-options`} value={String(value||'')} onChange={event=>change(field.id,event.target.value)}/><datalist id={`${field.id}-options`}>{options.map((option,index)=><option key={index} value={option.value}>{option.label}</option>)}</datalist></>:field.type==='select'?<select {...common} multiple={multiple} value={multiple?(Array.isArray(value)?value.map(String):typeof value==='string'&&value?[value]:[]):String(value||'')} onChange={event=>change(field.id,multiple?Array.from(event.target.selectedOptions).map(option=>option.value):event.target.value)}>{!multiple&&<option value="">Select an option</option>}{options.map((option,index)=><option key={index} value={option.value}>{option.label}</option>)}</select>:<input {...common} type={field.type==='phone'?'tel':['email','number'].includes(field.type)?field.type:'text'} value={String(value||'')} min={field.limit_min||undefined} max={field.limit_max||undefined} step={field.type==='number'?1:undefined} readOnly={field.id==='text-yes-school'} placeholder={field.placeholder} onChange={event=>change(field.id,event.target.value)}/ >}{error&&<p id={`${field.id}-error`} role="alert">{error}</p>}</Field>;
}

function ReferenceUpload({field,record,token,refresh}:{field:ReferenceField;record:Row;token:string;refresh:()=>Promise<void>}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState<unknown>(),[progress,setProgress]=useState('');
 const file=record.files?.find((file:Row)=>file.field_id===field.id);const headers:Record<string,string>=token?{'X-Draft-Key':token}:{};
 async function upload(selected:File){
  setBusy(true);setError(null);setProgress('Preparing your file…');
  try{
   const checksum=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await selected.arrayBuffer()))).map(byte=>byte.toString(16).padStart(2,'0')).join('');
   const upload=await api<Row>('/api/forms/files/begin',{...json('POST',{recordId:record.id,fieldId:field.id,filename:selected.name,size:selected.size,checksum}),headers});
   if(upload.status==='pending'){
    const count=Math.ceil(selected.size/upload.partSize);
    for(let part=1;part<=count;part++){
     setProgress(`Uploading part ${part} of ${count}…`);
     const signed=await api<Row>(`/api/forms/files/${upload.id}/part`,{...json('POST',{partNumber:part}),headers});
     const result=await fetch(signed.url,{method:'PUT',body:selected.slice((part-1)*upload.partSize,Math.min(part*upload.partSize,selected.size))});
     if(!result.ok)throw new Error('The upload was interrupted. Select the same file to retry.');
    }
    await api(`/api/forms/files/${upload.id}/complete`,{...json('POST',{}),headers});
   }
   setProgress('Upload received. Verification will finish before submission.');await refresh();
  }catch(error){setError(error);}finally{setBusy(false);}
 }
 return <div className="field"><label htmlFor={field.id}>{field.field_label}{enabled(field.required)?' *':''}</label><small>{plainText(field.description)}</small>{file?<p role="status">{file.filename}: {file.status==='ready'?'Verified':file.status==='rejected'?`Please contact support: ${file.metadata?.error||'file rejected'}`:file.verification_failed?'Verification could not be completed. Start a new draft or contact support.':'Waiting for verification'}</p>:null}{(!file||file.status==='pending')&&<input id={field.id} type="file" disabled={busy} accept={(field.filetypes||[]).filter((ext:string)=>['pdf','mp4','jpg','jpeg'].includes(ext)).map((ext:string)=>'.'+ext).join(',')} onChange={event=>{if(event.target.files?.[0])void upload(event.target.files[0]);}}/>}{file?.status==='ready'&&<RetainedFileDownload fileId={file.id} token={token} label="Download retained file"/>}{progress&&<p role="status">{progress}</p>}<Errors error={error}/></div>;
}
