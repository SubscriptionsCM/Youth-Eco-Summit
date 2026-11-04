'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { competitionGuidelines2027, guidelineClassesLabel } from '../data/guidelines-2027';
import { referenceForms } from '../domain/wordpress-forms';
import { SchoolAutocomplete } from './registration';
import { ReferenceFormPage } from './reference-form';
import { PageTitle, Notice } from './shared';
import type { Row } from './api';
export function EntryJourney({submitter='',competition='',mode=''}:{submitter?:string;competition?:string;mode?:string}) {
 const [school,setSchool]=useState<Row|null>(null),[size,setSize]=useState(2),[saved,setSaved]=useState(false);
 useEffect(()=>setSaved(window.location.hash.includes('saved=')),[]);
 const selected=competitionGuidelines2027.find(item=>item.slug===competition);
 const role=['student','educator'].includes(submitter)?submitter:'';
 const path=(values:Record<string,string>)=>`/competitions/enter?${new URLSearchParams({...role?{submitter:role}:{},...selected?{competition:selected.slug}:{},...values})}`;
 if(!role)return <><PageTitle title="Submit your entry">Choose who is submitting. You can enter more than one competition, one at a time.</PageTitle><section className="panel"><h2>Who is submitting?</h2><div className="grid"><Link className="button" href={path({submitter:'student'})}>I am a student</Link><Link className="button secondary" href={path({submitter:'educator'})}>I am an educator</Link></div></section><p>Started an entry earlier? <Link href="/dashboard">Continue a saved entry</Link></p></>;
 if(!selected)return <><PageTitle title="Choose your competition">Choose one challenge now. You can submit another entry afterwards.</PageTitle><div className="grid">{competitionGuidelines2027.map(item=><article className="panel" key={item.slug}><h2>{item.title}</h2><p>{guidelineClassesLabel(item)}</p><p>{item.team.allowed?'Individual or team':'Individual entry'}</p><Link className="button" href={path({competition:item.slug})}>Choose {item.title}</Link></article>)}</div><Link href="/competitions/enter">Change student or educator</Link></>;
 if(!referenceForms.some(form=>form.key===selected.slug))return <Notice>This competition form is unavailable.</Notice>;
 const entryMode=selected.team.allowed&&mode==='team'?'team':'individual';
 if(selected.team.allowed&&!['individual','team'].includes(mode))return <><PageTitle title={selected.title}>Choose your entry type.</PageTitle><div className="actions"><Link className="button" href={path({mode:'individual'})}>Individual entry</Link><Link className="button secondary" href={path({mode:'team'})}>Team entry</Link></div></>;
 if(!school&&!saved)return <><PageTitle title={selected.title}>Select your registered school and confirm its branch.</PageTitle>{entryMode==='team'&&<label>Number of students in the team <select value={size} onChange={event=>setSize(Number(event.target.value))}>{Array.from({length:selected.team.maxMembers-1},(_,index)=>index+2).map(number=><option key={number}>{number}</option>)}</select></label>}<SchoolAutocomplete onSelect={setSchool}/><p>School not listed? Ask your educator to <Link href="/schools/register">register your school</Link> first.</p></>;
 return <><ReferenceFormPage formKey={selected.slug} initialAnswers={{'hidden-yes-submitter':role,'radio-yes-entry-mode':entryMode,...entryMode==='team'?{'number-yes-team-size':String(size)}:{},...school?{'text-yes-school-id':school.reference,'text-yes-school':`${school.name}, ${school.address}, ${school.city}`}:{}}}/>{school&&<button type="button" className="secondary" onClick={()=>setSchool(null)}>Choose another school</button>}</>;
}
