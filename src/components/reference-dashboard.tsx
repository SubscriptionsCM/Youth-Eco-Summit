'use client';
import Link from 'next/link';
import { AuthGate, PageTitle, ResourceState, useResource } from './shared';
import { formTitle, referenceForms } from '../domain/wordpress-forms';
import type { Row } from './api';
export function ReferenceDashboard(){return <AuthGate>{()=> <SavedForms/>}</AuthGate>;}
function SavedForms(){
 const records=useResource<Row>('/api/forms/records');
 const history=useResource<Row>('/api/forms/history');
 return <><PageTitle title="Your saved forms and entries">Continue a draft or keep a submitted reference for your records.</PageTitle><div className="actions"><Link className="button" href="/competitions/enter">Start a new competition entry</Link><Link href="/register">Student registration</Link><Link href="/teachers/register">Educator registration</Link></div><ResourceState {...records} retry={records.reload}/>{records.data?.items?.length?records.data.items.map((record:Row)=><article key={record.id} className="panel"><h2>{formTitle(referenceForms.find(form=>form.key===record.form_key)!)}</h2><p>{record.reference} · {record.status==='submitted'?'Submitted':'Saved draft'}</p>{record.submitter_role&&<p>Submitted by: {record.submitter_role==='educator'?'an educator on behalf of the school':'a student'}</p>}<Link href={`/forms/${record.form_key}#saved=${record.id}`}>{record.status==='submitted'?'View receipt':'Continue this saved form'}</Link></article>):records.data&&<p>You have no saved forms yet.</p>}<section><h2>Earlier entries</h2><ResourceState {...history} retry={history.reload}/>{history.data?.items?.length?history.data.items.map((record:Row)=><article className="panel" key={record.id}><h3>{record.title}</h3><p>Reference {record.sourceId} · {record.status||'Retained'}</p><Link href={`/history/${record.id}`}>View earlier entry</Link></article>):history.data&&<p>No earlier entries are linked to this account. If you submitted through the previous website, contact the summit team for help locating your records.</p>}</section></>;
}
