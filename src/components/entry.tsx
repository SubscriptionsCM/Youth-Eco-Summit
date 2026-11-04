'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api, date, json, label, type Row } from './api';
import { AssetList, DraftAssetRemoval, UploadForm } from './uploads';
import { TeamInvitation } from './teams';
import { FormSteps } from './form-steps';
import { submitSavedEntry } from './entry-submission';
import { AuthGate, Errors, Field, Notice, PageTitle, ResourceState, useResource } from './shared';

type Step='details'|'team'|'upload'|'review';
const stepLabels:Record<Step,string>={details:'Entry details',team:'Your team',upload:'Upload work',review:'Review & submit'};
export function EntryPage({ id }: { id: string }) { return <AuthGate>{actor => <EntryEditor key={id} id={id} actor={actor} />}</AuthGate>; }
function EntryEditor({ id, actor }: { id: string; actor: Row }) {
  const resource=useResource<Row>(`/api/entries/${id}`);
  const [answers,setAnswers]=useState<Row>({}),[members,setMembers]=useState(''),[step,setStep]=useState<Step>('details');
  const [error,setError]=useState<unknown>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[submissionPending,setSubmissionPending]=useState(false);
  const saving=useRef(false),pendingSubmission=useRef<number|null>(null);
  const dirty=useRef(false),draftVersion=useRef<number|undefined>(undefined),heading=useRef<HTMLHeadingElement>(null);
  const entry=resource.data?.entry,competition=resource.data?.competition,config=competition?.config||{},assets:Row[]=resource.data?.assets||[];
  const steps:Step[]=config.mode==='team'?['details','team','upload','review']:['details','upload','review'];
  useEffect(()=>{if(resource.data?.entry&&!dirty.current){const saved=resource.data.entry;const incomingVersion=saved.lockVersion??saved.lock_version;if(draftVersion.current!==undefined&&incomingVersion<draftVersion.current)return;setAnswers(saved.answers||{});setMembers((saved.memberIds||saved.member_ids||[]).join('\n'));draftVersion.current=saved.lockVersion??saved.lock_version;setStep(saved.current_step||'details');}},[resource.data]);
  useEffect(()=>{function warn(event:BeforeUnloadEvent){if(dirty.current||pendingSubmission.current!==null){event.preventDefault();event.returnValue='';}}window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[]);
  const editable=actor.role==='participant'&&entry&&entry.canEdit!==false&&['draft','reopened'].includes(entry.state||entry.status);
  const currentAssets=assets.filter(a=>a.revision===entry?.revision+1);
  const filesReady=currentAssets.length>=(config.files?.minCount||0)&&currentAssets.every(a=>a.status==='ready')&&(config.files?.roles||[]).every((role:Row)=>currentAssets.filter(a=>a.role===role.id&&a.status==='ready').length>=role.minCount);
  // A complete answer snapshot and CAS version are saved together. File refreshes never overwrite dirty fields.
  async function persist(next:Step){
    const memberIds=members.split(/[\n,]/).map(v=>v.trim()).filter(Boolean);
    const updated=await api<Row>(`/api/entries/${id}`,json('PUT',{answers,memberIds,currentStep:next,lockVersion:draftVersion.current}));
    dirty.current=false;draftVersion.current=updated.lockVersion??updated.lock_version;
    resource.setData({...resource.data,entry:{...entry,...updated,memberIds}});setStep(next);
    return draftVersion.current;
  }
  async function save(next:Step=step){
    if(saving.current||pendingSubmission.current!==null)return;saving.current=true;setBusy(true);setError(null);setMessage('');
    try{await persist(next);setMessage('Progress saved. You can return to this entry from your dashboard.');if(next!==step)requestAnimationFrame(()=>heading.current?.focus());}
    catch(e){setError(e);}finally{saving.current=false;setBusy(false);}
  }
  async function submit(){
    if(saving.current)return;saving.current=true;setBusy(true);setError(null);setMessage('');
    try{
      const receipt=await submitSavedEntry<Row>(pendingSubmission,()=>persist('review'),version=>{
        setSubmissionPending(true);
        return api<Row>(`/api/entries/${id}/submit`,json('POST',{lockVersion:version}));
      });
      setSubmissionPending(false);
      resource.setData(previous=>previous?{...previous,entry:{...previous.entry,...receipt,canEdit:false}}:previous);
      resource.reload();setMessage('Submission accepted. Your receipt is shown below.');
    }catch(e){
      setError(e);setSubmissionPending(pendingSubmission.current!==null);
      if(pendingSubmission.current!==null)setMessage('Submission status could not be confirmed. Your saved details are locked while this is checked. Select Retry submission confirmation to safely retrieve the result.');
    }finally{saving.current=false;setBusy(false);}
  }
  function change(key:string,value:unknown){if(saving.current||pendingSubmission.current!==null)return;dirty.current=true;setAnswers(current=>({...current,[key]:value}));setMessage('');}
  if(!resource.data&&(resource.loading||resource.error))return <ResourceState {...resource} retry={resource.reload}/>;
  const details=resource.data;
  if(!details||!entry)return <Notice error>This entry is not available.</Notice>;
  const index=Math.max(0,steps.indexOf(step));
  const fields:Row[]=config.fields||[],detailFields=fields.filter(f=>f.step!=='declarations'),declarations=fields.filter(f=>f.step==='declarations');
  return <>
    <PageTitle title={competition?.title||'Competition entry'}>Reference: {entry.reference} · {label(entry.state||entry.status)}</PageTitle>
    <Errors error={error||resource.error}/>{resource.loading&&<p role="status">Refreshing file and entry status…</p>}{message&&<Notice>{message}</Notice>}
    {!editable&&entry.state!=='draft'&&<div className="receipt"><h2>Submission receipt</h2><p>Reference: <strong>{entry.reference}</strong></p>{entry.submission_title&&<p className="prose">Submission title: {entry.submission_title}</p>}<p>Status: {label(entry.state||entry.status)}</p><p>Submitted: {date(entry.submittedAt||entry.submitted_at)}</p><p>This submitted revision is locked. Keep this reference for support.</p></div>}
    <details><summary>Competition guidelines</summary><p className="prose">{competition?.guidelines||'No additional guidelines published.'}</p></details>
    {editable&&<><FormSteps steps={steps.map(s=>stepLabels[s])} current={index}/><h2 ref={heading} tabIndex={-1}>{stepLabels[step]}</h2><p>Save each step to keep your progress. You can finish later from your dashboard.</p></>}
    {!editable?<><AnswerReview fields={fields} answers={answers}/><h2>Retained files</h2><AssetList assets={assets}/></>:<>
      {step==='details'&&<form className="form" onSubmit={e=>{e.preventDefault();void save(steps[index+1]);}}><fieldset disabled={busy||submissionPending} className="entry-fields"><legend>Project information</legend>{detailFields.map(field=><DynamicField key={field.key} field={field} classNumber={Number(entry.class)} value={answers[field.key]} onChange={value=>change(field.key,value)}/>)}</fieldset><StepActions busy={busy||submissionPending} save={()=>void save()} next/></form>}
      {step==='team'&&<><form className="form" onSubmit={e=>{e.preventDefault();void save('upload');}}><p>{config.minMembers===1?'You can enter on your own or add a team. ':''}Total team size: {config.minMembers}–{config.maxMembers}, including the lead student.</p><fieldset disabled={busy||submissionPending}><legend>Other team members</legend><Field name="members" title="Student registration IDs" hint="Add IDs for students you manage, or use a guardian invitation below. One ID per line. Team members must meet the competition rules."><textarea id="members" value={members} onChange={e=>{dirty.current=true;setMembers(e.target.value);setMessage('');}}/></Field></fieldset><StepActions busy={busy||submissionPending} save={()=>void save()} back={()=>void save('details')} next/></form><TeamInvitation entryId={id}/></>}
      {step==='upload'&&<><p>Each required file has its own purpose and limits. Wait for verification before continuing.</p>{config.files?.roles&&<ul>{config.files.roles.map((role:Row)=><li key={role.id}>{role.label}{role.minCount===0?' (optional)':' (required)'} · {role.types.join(', ')} · up to {role.maxBytes/1048576} MB{role.maxDurationSeconds?` · ${role.maxDurationSeconds} seconds`:''}</li>)}</ul>}{currentAssets.length?<AssetList assets={currentAssets}/>:<p>No files uploaded yet.</p>}<DraftAssetRemoval assets={currentAssets} onChanged={resource.reload}/>{config.files?.maxCount>0&&<UploadForm submissionId={id} config={config.files} onChanged={resource.reload}/>}<div className="actions"><button className="secondary" disabled={busy||submissionPending} onClick={()=>save(steps[index-1])}>Back</button><button className="secondary" disabled={busy||submissionPending} onClick={()=>save()}>Save progress</button><button disabled={busy||!filesReady} onClick={()=>save('review')}>{busy?'Saving…':'Save and continue'}</button></div>{!filesReady&&<p role="status">Upload and verify every required file to continue.</p>}</>}
      {step==='review'&&<><AnswerReview fields={detailFields} answers={answers}/>{config.mode==='team'&&<p>Additional student registration IDs: {members||'Entering individually'}</p>}<h3>Your files</h3><AssetList assets={currentAssets}/><form className="form" onSubmit={e=>{e.preventDefault();void submit();}}><fieldset disabled={busy||submissionPending}><legend>Final declarations</legend>{declarations.map(field=><DynamicField key={field.key} field={field} classNumber={Number(entry.class)} value={answers[field.key]} onChange={value=>change(field.key,value)}/>)}</fieldset><p>Check your details and files. Submitting locks this revision and creates your receipt.</p>{!filesReady&&<Notice>Some required files are missing or still being verified. Return to Upload work to resolve them.</Notice>}<div className="actions"><button type="button" className="secondary" disabled={busy||submissionPending} onClick={()=>save('upload')}>Back</button><button type="button" className="secondary" disabled={busy||submissionPending} onClick={()=>save()}>Save progress</button><button disabled={busy||(!submissionPending&&!filesReady)}>{busy?'Submitting…':submissionPending?'Retry submission confirmation':'Confirm and submit entry'}</button></div></form></>}
    </>}
    {details.revisions?.length>0&&<details><summary>Revision history</summary><ul>{details.revisions.map((r:Row)=><li key={r.id}>Revision {r.version||r.revisionNumber||r.revision_number} · {date(r.createdAt||r.created_at)}</li>)}</ul></details>}
    {details.assignments?.length>0&&<details><summary>Assignments and review history</summary><pre>{JSON.stringify({assignments:details.assignments,reviews:details.reviews,decisions:details.decisions},null,2)}</pre></details>}
    <div className="actions"><Link href="/dashboard">Back to your dashboard</Link><button className="secondary" disabled={busy||submissionPending} onClick={resource.reload}>Refresh entry</button>{dirty.current&&<button className="secondary" disabled={busy||submissionPending} onClick={()=>{dirty.current=false;setError(null);resource.reload();}}>Discard unsaved changes and reload</button>}</div>
  </>;
}
function StepActions({busy,save,back,next}:{busy:boolean;save:()=>void;back?:()=>void;next?:boolean}){return <div className="actions">{back&&<button type="button" className="secondary" disabled={busy} onClick={back}>Back</button>}<button type="button" className="secondary" disabled={busy} onClick={save}>{busy?'Saving…':'Save progress'}</button>{next&&<button disabled={busy}>{busy?'Saving…':'Save and continue'}</button>}</div>;}
function AnswerReview({fields,answers}:{fields:Row[];answers:Row}){return <section className="panel"><h3>Entry details</h3><dl>{fields.map(field=><div key={field.key}><dt>{field.label}</dt><dd>{typeof answers[field.key]==='boolean'?answers[field.key]?'Yes':'No':String(answers[field.key]??'Not provided')}</dd></div>)}</dl></section>;}
function DynamicField({field,value,onChange,classNumber}:{field:Row;value:any;onChange:(value:any)=>void;classNumber:number}){
  const common={id:field.key,name:field.key,required:field.required,min:field.min,max:field.max,maxLength:field.maxLength};
  const options=field.optionsByClass?field.optionsByClass.filter((group:Row)=>group.classes.includes(classNumber)).flatMap((group:Row)=>group.options):field.options;
  if(field.type==='checkbox')return <div className="field"><label className="check-label"><input {...common} type="checkbox" checked={Boolean(value)} onChange={e=>onChange(e.target.checked)}/>{field.label}{field.required&&' (required)'}</label>{field.description&&<small>{field.description}</small>}</div>;
  return <Field name={field.key} title={field.label} required={field.required} hint={field.description}>{field.type==='textarea'?<textarea {...common} value={value||''} onChange={e=>onChange(e.target.value)}/>:field.type==='select'?<select {...common} value={value||''} onChange={e=>onChange(e.target.value)}><option value="">Select an option</option>{options?.map((option:string)=><option key={option}>{option}</option>)}</select>:<input {...common} type={field.type==='number'?'number':'text'} value={value??''} onChange={e=>onChange(field.type==='number'&&e.target.value!==''?Number(e.target.value):e.target.value)}/>}</Field>;
}
