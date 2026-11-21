'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { competitionGuidelines2027, guidelineClassesLabel } from '../data/guidelines-2027';
import { referenceForms } from '../domain/wordpress-forms';
import { SchoolAutocomplete } from './registration';
import { ReferenceFormPage } from './reference-form';
import { PageTitle, Notice, ResourceState, useResource } from './shared';
import {entrySubmitter} from '../domain/participant-access';
import {api,type Row} from './api';
const boundedSize=(value:unknown,max=2)=>Math.min(max,Math.max(2,Number.isInteger(Number(value))?Number(value):2));
export function entryJourneyHref(context:Record<string,string>,changes:Record<string,string>={},hash=''){
 const values={...context,...changes},selected=competitionGuidelines2027.find(item=>item.slug===values.competition),params=new URLSearchParams();
 if(['student','educator'].includes(values.submitter))params.set('submitter',values.submitter);
 if(selected)params.set('competition',selected.slug);
 const mode=selected&&!selected.team.allowed?'individual':['individual','team'].includes(values.mode)?values.mode:'';
 if(mode)params.set('mode',mode);
 if(mode==='team'&&selected?.team.allowed)params.set('team_size',String(boundedSize(values.team_size,selected.team.maxMembers)));
 if(values.school_id?.trim())params.set('school_id',values.school_id.trim());
 return `/competitions/enter?${params}${values.competition===context.competition&&hash.startsWith('#')?hash:''}`;
}
export async function registeredEntrySchool(reference:string,signal?:AbortSignal):Promise<Row>{
 const id=reference.trim().toUpperCase();
 if(!id||id.length>100)throw new Error('Enter a valid registered school ID, or choose your school below.');
 const data=await api<Row>(`/api/public/schools?${new URLSearchParams({q:id})}`,{signal});
 const matches=(data.items||[]).filter((school:Row)=>typeof school.reference==='string'&&[school.reference,...(Array.isArray(school.alternate_references)?school.alternate_references:[])].some(value=>typeof value==='string'&&value.trim().toUpperCase()===id));
 if(matches.length!==1)throw new Error('This school ID could not be matched to one active registered school. Check the ID or choose the correct branch below.');
 return matches[0];
}
export function EntryJourney({submitter='',competition='',mode='',schoolId='',teamSize=''}:{submitter?:string;competition?:string;mode?:string;schoolId?:string;teamSize?:string}) {
 const session=useResource<Row>('/api/auth/session'),actor=session.data?.actor;
 const selected=competitionGuidelines2027.find(item=>item.slug===competition);
 const [school,setSchool]=useState<Row|null>(null),[size,setSize]=useState(()=>boundedSize(teamSize,selected?.team.maxMembers)),[savedHash,setSavedHash]=useState('');
 const [requestedSchool,setRequestedSchool]=useState(schoolId),[schoolLoading,setSchoolLoading]=useState(Boolean(schoolId)),[schoolError,setSchoolError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{const update=()=>setSavedHash(window.location.hash);update();window.addEventListener('hashchange',update);return()=>window.removeEventListener('hashchange',update);},[]);
 const saved=Boolean(new URLSearchParams(savedHash.slice(1)).get('saved'));
 const role=actor?entrySubmitter(actor)||'':['student','educator'].includes(submitter)?submitter:'';
 const context={submitter:role,competition:selected?.slug||'',mode,school_id:school?.reference||requestedSchool,team_size:String(size)};
 const path=(values:Record<string,string>)=>entryJourneyHref(context,values,savedHash);
 function persist(values:Record<string,string>){window.history.replaceState(null,'',entryJourneyHref(context,values,window.location.hash));}
 useEffect(()=>{
  if(!requestedSchool||saved){setSchoolLoading(false);return;}
  const controller=new AbortController();setSchoolLoading(true);setSchoolError('');
  registeredEntrySchool(requestedSchool,controller.signal).then(value=>{if(!controller.signal.aborted){setSchool(value);persist({school_id:value.reference});}}).catch(error=>{if(!controller.signal.aborted){setSchool(null);setSchoolError(error instanceof Error?error.message:'School lookup is unavailable. Try again.');}}).finally(()=>{if(!controller.signal.aborted)setSchoolLoading(false);});
  return()=>controller.abort();
 // Query changes remount this journey; team-size changes do not repeat school lookup.
 },[requestedSchool,saved,retry,actor?.role,actor?.participantKind]);
 if(session.loading||session.error)return <ResourceState {...session} retry={session.reload}/>;
 if(actor&&!entrySubmitter(actor))return <Notice>This account cannot create student or educator competition entries. <Link href={actor.role==='judge'?'/judge':['owner','admin'].includes(actor.role)?'/admin':'/dashboard'}>Go to your workspace</Link>.</Notice>;
 if(!role)return <><PageTitle title="Submit your entry">Choose who is submitting. You can enter more than one competition, one at a time.</PageTitle><section className="panel"><h2>Who is submitting?</h2><div className="grid"><Link className="button" href={path({submitter:'student'})}>I am a student</Link><Link className="button secondary" href={path({submitter:'educator'})}>I am an educator</Link></div></section><p>Started an entry earlier? <Link href="/dashboard">Continue a saved entry</Link></p></>;
 if(!selected)return <><PageTitle title="Choose your competition">Choose one challenge now. You can submit another entry afterwards.</PageTitle><div className="grid">{competitionGuidelines2027.map(item=><article className="panel" key={item.slug}><h2>{item.title}</h2><p>{guidelineClassesLabel(item)}</p><p>{item.team.allowed?'Individual or team':'Individual entry'}</p><Link className="button" href={path({competition:item.slug})}>Choose {item.title}</Link></article>)}</div>{!actor&&<Link href={path({submitter:''})}>Change student or educator</Link>}</>;
 if(!referenceForms.some(form=>form.key===selected.slug))return <Notice>This competition form is unavailable.</Notice>;
 const entryMode=selected.team.allowed&&mode==='team'?'team':'individual';
 if(selected.team.allowed&&!['individual','team'].includes(mode))return <><PageTitle title={selected.title}>Choose your entry type.</PageTitle><div className="actions"><Link className="button" href={path({mode:'individual'})}>Individual entry</Link><Link className="button secondary" href={path({mode:'team'})}>Team entry</Link></div></>;
 if(!school&&!saved)return <><PageTitle title={selected.title}>Select your registered school and confirm its branch.</PageTitle>{schoolLoading?<p role="status">Checking your registered school…</p>:<>{schoolError&&<><Notice error>{schoolError}</Notice><button type="button" className="secondary" onClick={()=>setRetry(value=>value+1)}>Try the school ID again</button></>}{entryMode==='team'&&<label>Number of students in the team <select value={size} onChange={event=>{const value=boundedSize(event.target.value,selected.team.maxMembers);setSize(value);persist({team_size:String(value)});}}>{Array.from({length:selected.team.maxMembers-1},(_,index)=>index+2).map(number=><option key={number}>{number}</option>)}</select></label>}<SchoolAutocomplete onSelect={value=>{setSchool(null);setSchoolError('');setSchoolLoading(true);setRequestedSchool(value.reference);setRetry(previous=>previous+1);persist({school_id:value.reference});}}/><p>School not listed? <Link href="/schools">Find or nominate your school</Link>. A school representative must complete registration before entry submission.</p></>}</>;
 return <><ReferenceFormPage key={`${selected.slug}:${role}`} formKey={selected.slug} initialAnswers={{'hidden-yes-submitter':role,'radio-yes-entry-mode':entryMode,...entryMode==='team'?{'number-yes-team-size':String(size)}:{},...school?{'text-yes-school-id':school.reference,'text-yes-school':`${school.name}, ${school.address}, ${school.city}`}:{}}}/>{school&&!saved&&<button type="button" className="secondary" onClick={()=>{setSchool(null);setRequestedSchool('');setSchoolError('');persist({school_id:''});}}>Choose another school</button>}</>;
}
