'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { checksumFile, runUploadRequest, retryUploadPart } from './upload-request';
import { api, ApiError, json, type Row } from './api';
import { Errors, Field, Notice, PageTitle, ResourceState, useResource } from './shared';
import { FormSteps } from './form-steps';
import {useUnsavedNavigation} from './unsaved-navigation';
import { SchoolAutocomplete } from './registration';
import { EmailAccount } from './email-account';
import { RetainedFileDownload, RetainedFormFiles } from './retained-form-files';
import { enabled, fieldLabel, fieldOptions, formSteps, formTitle, isFieldVisible, normalizeReferenceTitle, plainText, referenceForms, validateReferenceAnswers, type Answers, type ReferenceField } from '../domain/wordpress-forms';
import { SubmittedFormAnswers } from './submitted-form-answers';
import { loadSubmittedRecord, pendingSubmittedRecord } from './reference-receipt';
import {displayReferenceValue,nameParts} from '../domain/reference-values';
import {canUseForm,entrySubmitter} from '../domain/participant-access';
import {normalizeSchoolNominationAnswers} from '../domain/school-nomination';
import {dashboardPath} from './auth-navigation';
import {schoolNominationHref,studentRegistrationReturnPath} from './school-nomination-navigation';
import './reference-form.css';

export function ReferenceFormPage({formKey,initialAnswers={}}:{formKey:string;initialAnswers?:Answers}) {
 const form=referenceForms.find(f=>f.key===formKey);
 const configuration=useResource<Row>('/api/forms/config'),session=useResource<Row>('/api/auth/session');
 const [record,setRecord]=useState<Row|null>(null),[answers,setAnswers]=useState<Answers>(initialAnswers),[token,setToken]=useState(''),[step,setStep]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState<unknown>(),[message,setMessage]=useState(''),[fieldErrors,setFieldErrors]=useState<Record<string,string>>({});
 const loaded=useRef(''),heading=useRef<HTMLHeadingElement>(null),dirty=useRef(false);
 const [nominationReturn,setNominationReturn]=useState<string|null>(null);
 useEffect(()=>{if(formKey==='nomination')setNominationReturn(studentRegistrationReturnPath(new URLSearchParams(window.location.search).get('returnTo')));},[formKey]);
 function headers(key=token):Record<string,string>{return key?{'X-Draft-Key':key}:{};}
 useEffect(()=>{
  if(!session.dataPath||session.error)return;
  const actor=session.data?.actor,identity=`${formKey}:${actor?.id||actor?.role||'anonymous'}`;
  if((form?.competition||['student','teacher','school'].includes(formKey))&&!actor){loaded.current='';setRecord(null);setAnswers(initialAnswers);return;}
  if(loaded.current===identity)return;const hadIdentity=!!loaded.current;loaded.current=identity;setRecord(null);setStep(0);setMessage('');setError(undefined);setAnswers(previous=>({...hadIdentity?initialAnswers:previous,...actor?.contact&&['student','teacher'].includes(formKey)?{'email-1':actor.contact}:{}}));
  const saved=new URLSearchParams(window.location.hash.slice(1)).get('saved');
  if(!saved)return;
  const controller=new AbortController(),[id,key='']=saved.split('.');let settled=false;setToken(key);setBusy(true);
  api<Row>(`/api/forms/records/${encodeURIComponent(id)}`,{headers:headers(key),signal:controller.signal}).then(data=>{if(controller.signal.aborted)return;if(data.form_key!==formKey)throw new Error('This saved link belongs to a different form. Open its original page.');const restoredAnswers=formKey==='nomination'&&data.status==='draft'?normalizeSchoolNominationAnswers(data.answers):data.answers;setRecord(restoredAnswers===data.answers?data:{...data,answers:restoredAnswers});setAnswers(restoredAnswers);setStep(data.current_step);}).catch(error=>{if(!controller.signal.aborted)setError(error);}).finally(()=>{settled=true;if(!controller.signal.aborted)setBusy(false);});
  return()=>{controller.abort();if(!settled&&loaded.current===identity)loaded.current='';};
 },[formKey,session.dataPath,session.data?.actor?.id]);
 useUnsavedNavigation(()=>dirty.current);
 useEffect(()=>{
  if(!record?.files?.some((f:Row)=>['uploaded','pending'].includes(f.status)&&!f.verification_failed))return;
  const timer=setInterval(()=>{void refresh().catch(setError);},4000);return()=>clearInterval(timer);
 },[record?.id,record?.files,token]);
 async function refresh(signal?:AbortSignal){if(!record)return;const data=await api<Row>(`/api/forms/records/${record.id}`,{headers:headers(),signal});setRecord(previous=>({...previous,files:data.files}));}
 if(!form)return <Notice error>This form is not available.</Notice>;
 const steps=formSteps(form),actor=session.data?.actor,needsAccount=form.competition||['student','teacher','school'].includes(form.key);
 const permitted=canUseForm(actor,formKey,record?.answers?.['hidden-yes-submitter']??answers['hidden-yes-submitter']);
 function change(key:string,value:unknown){dirty.current=true;setAnswers(previous=>({...previous,[key]:value}));setMessage('');setFieldErrors(previous=>{const next={...previous};if(formKey==='nomination'&&['email-2','phone-2'].includes(key)&&previous['email-2']&&previous['email-2']===previous['phone-2']){delete next['email-2'];delete next['phone-2'];}delete next[key];return next;});}
 function showFieldErrors(errors:Record<string,string>){
  setFieldErrors(errors);
  const first=steps.findIndex(item=>item.fields.some(field=>isFieldVisible(field,answers)&&(errors[field.id]||(errors['registered-school-id']&&isSchoolControl(formKey,field)))));
  if(first>=0){setStep(first);requestAnimationFrame(()=>heading.current?.focus());}
 }
 async function begin(){if(!permitted){setError(new Error('This form is not available for your account type.'));return;}const context={...initialAnswers,...form?.competition?{'hidden-yes-submitter':entrySubmitter(actor),'radio-yes-entry-mode':initialAnswers['radio-yes-entry-mode']||'individual'}:{}};setBusy(true);setError(null);try{const data=await api<Row>('/api/forms/records',json('POST',{formKey,context}));setRecord(data.record);setAnswers(previous=>({...previous,...context}));setToken(data.token||'');window.history.replaceState(null,'',`${window.location.pathname}${window.location.search}#saved=${data.record.id}${data.token?'.'+data.token:''}`);window.dispatchEvent(new Event('hashchange'));}catch(error){setError(error);}finally{setBusy(false);}}
 async function save(next=step,validate=false){
  if(!record||!form)return false;if(!permitted){setError(new Error('This saved form is read-only for your account type.'));return false;}
  if(validate){const checked=validateReferenceAnswers(form,answers,{final:true,step});if(Object.keys(checked.errors).length){showFieldErrors(checked.errors);setError(new Error('Complete the required information before continuing.'));return false;}}
  setBusy(true);setError(null);
  try{const saved=await api<Row>(`/api/forms/records/${record.id}`,{...json('PUT',{answers,currentStep:next,lockVersion:record.lock_version}),headers:headers()});setRecord({...record,...saved});if(formKey==='nomination'&&saved.answers)setAnswers(normalizeSchoolNominationAnswers(saved.answers));setStep(next);dirty.current=false;setMessage('Your progress is saved. Keep the private link to continue later.');requestAnimationFrame(()=>heading.current?.focus());return true;}catch(error){setError(error);return false;}finally{setBusy(false);}
 }
 async function submit(){
  if(!record)return;if(!permitted){setError(new Error('This saved form is read-only for your account type.'));return;}setBusy(true);setError(null);setFieldErrors({});
  try{const receipt=await api<Row>(`/api/forms/records/${record.id}/submit`,{...json('POST',{answers,lockVersion:record.lock_version}),headers:headers()});setRecord(pendingSubmittedRecord(record,receipt));dirty.current=false;setMessage(formKey==='nomination'?'Your nomination has been received.':'Your submission has been received.');setRecord(await loadSubmittedRecord(record,receipt,()=>api<Row>(`/api/forms/records/${record.id}`,{headers:headers()})));}
  catch(error){setError(error);if(error instanceof ApiError)showFieldErrors(error.fields||{});}finally{setBusy(false);}
 }
 return <><PageTitle title={formTitle(form)}>{formKey==='nomination'?'Share your school’s details and a school representative’s contact. The summit team will contact them to complete school registration. A nomination alone does not enable participation.':form.competition?'Complete the student details, prepare your work, then review and submit.':'Complete the form below. Your progress can be saved for later.'}</PageTitle><ResourceState {...configuration} retry={configuration.reload}/><Errors error={formKey==='nomination'&&error instanceof ApiError?new Error(error.message):error}/>{message&&<Notice>{message}</Notice>}{configuration.data&&!configuration.data.enabled?<Notice>Registration is being prepared on this website. Continue at <a href="https://youthecosummit.com/">youthecosummit.com</a>.</Notice>:configuration.data&&<>
 {needsAccount&&(session.loading||session.error)?<ResourceState {...session} retry={session.reload}/>:needsAccount&&!actor?<EmailAccount provider={configuration.data?.accountProvider === 'wordpress' ? 'wordpress' : configuration.data?.accountProvider === 'supabase' ? 'supabase' : 'native'} registrationForm={formKey === 'student' || formKey === 'teacher' || formKey === 'school' ? formKey : form.competition?(initialAnswers['hidden-yes-submitter']==='educator'?'teacher':'student'):undefined} onSignedIn={account=>{if(account && (formKey === 'student' || formKey === 'teacher'))setAnswers(previous=>({...previous,'email-1':previous['email-1']||account.email,...account.username?{'text-1':previous['text-1']||account.username}:{}}));session.reload();}}/>:!record&&!permitted?<Notice>This form is not available for your account type. <Link href={dashboardPath(actor?.role)}>Go to your workspace</Link>.</Notice>:!record?<section className="panel"><h2>Before you begin</h2><p>{formKey==='nomination'?'Have a teacher or school representative’s name, designation, and email or phone ready. Your own contact details are optional. Once the school is registered and active, return to student registration and select its permanent school ID.':needsAccount?'Have your registered school ID and the required contact details ready.':'Have your contact details and the requested information ready.'} Save the private link before leaving.</p>{form.competition&&<p>Submitting as: <strong>{String(initialAnswers['hidden-yes-submitter']||'student')}</strong> · {String(initialAnswers['radio-yes-entry-mode']||'individual')}</p>}<button onClick={begin} disabled={busy}>{busy?'Opening…':'Start form'}</button></section>:record.status==='submitted'?<section className="receipt" role="status"><h2>{formKey==='nomination'?'Nomination received':'Submission received'}</h2><p>Reference: <strong>{record.reference}</strong></p><p>Submitted: {new Date(record.receipt?.submittedAt||record.submitted_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST</p>{formKey==='nomination'&&<><p>The summit team will contact the school representative you provided to help them complete school registration.</p><p>Your nomination alone does not register the school or enable participation. Once the school is registered and active, return to your saved student registration and select its permanent school ID.</p></>}{formKey!=='nomination'&&record.receipt?.schoolStatus==='pending'&&(record.current_school_status==='active'?<p>Your school registration is approved. Its permanent ID is available in the <Link href="/schools">school directory</Link>.</p>:record.current_school_status==='inactive'?<p>Your school registration is currently inactive. Contact the summit team for help.</p>:<p>Your school registration is pending review. Use its permanent ID after approval.</p>)}<SubmittedFormAnswers form={form} record={record}/><RetainedFormFiles files={record.files} token={token}/>{formKey==='nomination'?<Link className="button" href={nominationReturn||'/register'}>{nominationReturn?'Return to student registration':'Back to student registration'}</Link>:<Link href={dashboardPath(actor?.role)}>View your account</Link>}</section>:!permitted?<section className="panel"><h2>Saved form</h2><Notice>This saved form is read-only for your account type. Contact the summit team if your account type needs correction.</Notice><SubmittedFormAnswers form={form} record={record}/><RetainedFormFiles files={record.files} token={token}/><Link href={dashboardPath(actor?.role)}>Go to your workspace</Link></section>:<div className="reference-form"><FormSteps steps={steps.map(step=>step.label)} current={step}/><h2 ref={heading} tabIndex={-1}>{steps[step]?.label}</h2><p>{formKey==='nomination'?'Provide at least one school contact email or phone so the team can follow up. Your own details are optional.':'Your progress is saved at each step. Review your details before submitting.'}</p><form className="form panel" onSubmit={event=>{event.preventDefault();void (step<steps.length-1?save(step+1,true):submit());}}><fieldset disabled={busy} className="reference-fieldset"><legend className="sr-only">{steps[step]?.label}</legend>{steps[step]?.fields.filter(field=>isFieldVisible(field,answers)).map(field=><ReferenceControl key={field.id} field={field} answers={answers} change={change} formKey={formKey} record={record} token={token} refresh={refresh} onNominate={async()=>{if(await save())window.location.assign(schoolNominationHref(`${window.location.pathname}${window.location.search}${window.location.hash}`));}} error={fieldErrors[field.id]||(isSchoolControl(formKey,field)?fieldErrors['registered-school-id']:undefined)}/>)}</fieldset>{step===steps.length-1&&steps.length>1&&<details><summary>Review your saved information</summary><dl>{form.fields.filter(field=>!['html','group','page-break','hidden','password','upload','consent'].includes(field.type)&&isFieldVisible(field,answers)&&answers[field.id]!==undefined).map(field=><div key={field.id}><dt>{fieldLabel(field,answers)}</dt><dd>{displayReferenceValue(field.type,answers[field.id])}</dd></div>)}</dl></details>}{fieldErrors._form&&<Notice error>{fieldErrors._form}</Notice>}<div className="actions">{step>0&&<button type="button" className="secondary" disabled={busy} onClick={()=>save(step-1)}>Previous</button>}<button type="button" className="secondary" disabled={busy} onClick={()=>save()}>Save and continue later</button><button disabled={busy}>{busy?'Saving…':step<steps.length-1?'Save and continue':formKey==='nomination'?'Submit nomination':form.settings.submitData?.['custom-submit-text']||'Submit'}</button></div></form><div className="actions"><button type="button" className="secondary" onClick={async()=>{try{await navigator.clipboard.writeText(window.location.href);setMessage('Private saved-form link copied. Keep it safe.');}catch{setMessage('Copy the private link from your browser address bar.');}}}>Copy link to saved form</button><Link href="/dashboard">Continue a saved entry from your account</Link></div></div>}
 </>}</>;
}

function isSchoolControl(formKey:string,field:ReferenceField){return Boolean(field.catalogue&&['student','teacher'].includes(formKey)||field.id==='text-yes-school-id');}

export function ReferenceControl({field,answers,change,formKey,record,token,refresh,error,onNominate}:{field:ReferenceField;answers:Answers;change:(key:string,value:unknown)=>void;formKey:string;record:Row;token:string;refresh:(signal?:AbortSignal)=>Promise<void>;error?:string;onNominate?:()=>void|Promise<void>}) {
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
 if(isSchoolControl(formKey,field))return <div className="field"><label>{label}{required?' *':''}</label><SchoolAutocomplete onNominate={onNominate} onSelect={school=>{change(field.id,field.id==='text-yes-school-id'?school.reference:school.name);change('registered-school-id',school.reference);change('text-yes-school',`${school.name}, ${school.address}, ${school.city}`);}}/>{Boolean(value)&&<p role="status">Selected: {String(value)} {String(answers['registered-school-id']||'')}</p>}{error&&<p role="alert">{error}</p>}</div>;
 if(field.type==='address')return <fieldset><legend>{label}</legend>{['street_address','address_line','address_city','address_state','address_zip','address_country'].filter(part=>enabled(field[part])).map(part=><Field key={part} name={`${field.id}-${part}`} title={field[`${part}_label`]||part} required={enabled(field[`${part}_required`])} value={String((value as Record<string,unknown>)?.[part]||'')} onChange={(event:React.ChangeEvent<HTMLInputElement>)=>change(field.id,{...(value as object||{}),[part]:event.target.value})}/>)}{error&&<p role="alert">{error}</p>}</fieldset>;
 if(field.type==='consent')return <div className="field"><label className="check-label"><input {...common} type="checkbox" checked={value===true} onChange={event=>change(field.id,event.target.checked)}/>{plainText(field.consent_description)||label}{required?' *':''}</label>{error&&<p role="alert">{error}</p>}</div>;
 if(field.type==='radio')return <fieldset><legend>{label}{required?' *':''}</legend>{options.map(option=><label className="check-label" key={option.value}><input name={field.id} type="radio" value={option.value} checked={value===option.value} required={required} onChange={()=>change(field.id,option.value)}/>{option.label}</label>)}{error&&<p role="alert">{error}</p>}</fieldset>;
 const multiple=field.value_type==='multiselect';
 return <Field id={field.id} name={field.id} title={label} required={required} hint={plainText(field.description)+(field.id==='text-yes-title'?' Spaces and punctuation are converted to underscores.':'')}>{field.type==='textarea'?<textarea {...common} value={String(value||'')} maxLength={20000} onChange={event=>change(field.id,event.target.value)}/>:field.catalogue?<><input {...common} list={`${field.id}-options`} value={String(value||'')} onChange={event=>change(field.id,event.target.value)}/><datalist id={`${field.id}-options`}>{options.map((option,index)=><option key={index} value={option.value}>{option.label}</option>)}</datalist></>:field.type==='select'?<select {...common} multiple={multiple} value={multiple?(Array.isArray(value)?value.map(String):typeof value==='string'&&value?[value]:[]):String(value||'')} onChange={event=>change(field.id,multiple?Array.from(event.target.selectedOptions).map(option=>option.value):event.target.value)}>{!multiple&&<option value="">Select an option</option>}{options.map((option,index)=><option key={index} value={option.value}>{option.label}</option>)}</select>:<input {...common} type={field.type==='phone'?'tel':['email','number'].includes(field.type)?field.type:'text'} value={String(value||'')} min={field.limit_min||undefined} max={field.limit_max||undefined} maxLength={field.max_length?Number(field.max_length):undefined} step={field.type==='number'?1:undefined} readOnly={field.id==='text-yes-school'} placeholder={field.placeholder} onBlur={field.id==='text-yes-title'?event=>change(field.id,normalizeReferenceTitle(event.target.value)):undefined} onChange={event=>change(field.id,event.target.value)}/ >}{error&&<p id={`${field.id}-error`} role="alert">{error}</p>}</Field>;
}

function ReferenceUpload({field,record,token,refresh}:{field:ReferenceField;record:Row;token:string;refresh:(signal?:AbortSignal)=>Promise<void>}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState<unknown>(),[progress,setProgress]=useState(''),[retry,setRetry]=useState(false);
 const active=useRef<AbortController|null>(null),selectedFile=useRef<File|null>(null);
 const file=record.files?.find((file:Row)=>file.field_id===field.id);const headers:Record<string,string>=token?{'X-Draft-Key':token}:{};
 useEffect(()=>()=>{active.current?.abort();active.current=null;selectedFile.current=null;},[]);
 function cancel(){active.current?.abort();active.current=null;setBusy(false);setError(undefined);setRetry(true);setProgress('Upload cancelled. Retry when your connection is ready.');}
 async function upload(selected:File){
  if(active.current)return;
  const controller=new AbortController();active.current=controller;selectedFile.current=selected;
  const current=()=>active.current===controller&&!controller.signal.aborted;
  setBusy(true);setRetry(false);setError(undefined);setProgress('Preparing your file…');
  try{
   const checksum=await checksumFile(selected,controller.signal,percent=>{if(current())setProgress(`Checking file integrity… ${percent}%`);});
   if(!current())return;
   const upload=await runUploadRequest(signal=>api<Row>('/api/forms/files/begin',{...json('POST',{recordId:record.id,fieldId:field.id,filename:selected.name,size:selected.size,checksum}),headers,signal}),controller.signal);
   if(upload.status==='pending'){
    const count=Math.ceil(selected.size/upload.partSize);
    for(let part=1;part<=count;part++){
     if(!current())return;
     const label=`Uploading part ${part} of ${count}`;setProgress(`${label}…`);
     await retryUploadPart(async signal=>{
      const signed=await runUploadRequest(inner=>api<Row>(`/api/forms/files/${upload.id}/part`,{...json('POST',{partNumber:part}),headers,signal:inner}),signal);
      return fetch(signed.url,{method:'PUT',body:selected.slice((part-1)*upload.partSize,Math.min(part*upload.partSize,selected.size)),signal});
     },controller.signal,attempt=>{if(current())setProgress(`${label} (attempt ${attempt} of 3)…`);});
    }
    await runUploadRequest(signal=>api(`/api/forms/files/${upload.id}/complete`,{...json('POST',{}),headers,signal}),controller.signal);
   }
   if(!current())return;
   setProgress('Upload received. Verification will finish before submission.');
   await runUploadRequest(signal=>refresh(signal),controller.signal);
   if(current()){selectedFile.current=null;setRetry(false);}
  }catch(error){
   if(current()){setError(error instanceof TypeError?new Error('The upload was interrupted. Check your connection and retry the same file.'):error);setRetry(true);setProgress('Upload paused. Retry the same file.');}
  }finally{if(active.current===controller){active.current=null;setBusy(false);}}
 }
 return <div className="field"><label htmlFor={field.id}>{field.field_label}{enabled(field.required)?' *':''}</label><small>{plainText(field.description)}</small>{file?<p role="status">{file.filename}: {file.status==='ready'?'Verified':file.status==='rejected'?`Please contact support: ${file.metadata?.error||'file rejected'}`:file.verification_failed?'Verification could not be completed. Start a new draft or contact support.':'Waiting for verification'}</p>:null}{(!file||file.status==='pending')&&<input id={field.id} type="file" disabled={busy} accept={(field.filetypes||[]).filter((ext:string)=>['pdf','mp4','jpg','jpeg'].includes(ext)).map((ext:string)=>'.'+ext).join(',')} onChange={event=>{const selected=event.currentTarget.files?.[0];event.currentTarget.value='';if(selected)void upload(selected);}}/>}{busy&&<button type="button" className="secondary" onClick={cancel}>Cancel upload</button>}{!busy&&retry&&selectedFile.current&&(!file||file.status==='pending')&&<button type="button" className="secondary" onClick={()=>{if(selectedFile.current)void upload(selectedFile.current);}}>Retry upload</button>}{file?.status==='ready'&&<RetainedFileDownload fileId={file.id} token={token} label="Download submitted file"/>}{progress&&<p role="status">{progress}</p>}<Errors error={error}/></div>;
}
