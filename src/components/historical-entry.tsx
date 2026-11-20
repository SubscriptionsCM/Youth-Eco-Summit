'use client';
import Link from 'next/link';
import {Fragment,useState} from 'react';
import {AuthGate,Errors,PageTitle,ResourceState,useResource} from './shared';
import {api,type Row} from './api';
import {displayReferenceValue} from '../domain/reference-values';
import {JudgePickerDate} from './judge-picker-date';

export function HistoricalEntry({id}:{id:string}){return <AuthGate roles={['participant','owner','admin']}>{actor=><Entry id={id} staff={['owner','admin'].includes(actor.role)}/>}</AuthGate>;}
function Entry({id,staff}:{id:string;staff:boolean}){
 const record=useResource<Row>(`/api/forms/history/${encodeURIComponent(id)}`);
 const [error,setError]=useState<unknown>(null),[busy,setBusy]=useState('');
 async function download(fileId:string){setBusy(fileId);setError(null);try{const result=await api<{url:string}>(`/api/forms/history/files/${encodeURIComponent(fileId)}/download`,{method:'POST'});window.location.assign(result.url);}catch(e){setError(e);}finally{setBusy('');}}
 return <><Link href={staff?'/admin/reference-forms':'/dashboard'}>{staff?'Back to forms & submissions':'Back to your dashboard'}</Link><ResourceState {...record} retry={record.reload}/>{record.data&&<><PageTitle title={record.data.title||'Submission'}>Reference {record.data.sourceId}</PageTitle><JudgePickerDate source="wordpress" entry={{submitted_at:record.data.createdAt}}/><dl className="panel">{record.data.fields?.map((field:Row)=><Fragment key={field.id}><dt>{field.label}</dt><dd style={{whiteSpace:'pre-wrap'}}>{displayReferenceValue(field.type,field.value)}</dd></Fragment>)}</dl>{record.data.attachments?.length>0&&<section className="panel"><h2>Attachments</h2><Errors error={error}/><ul>{record.data.attachments.map((file:Row)=><li key={file.id}><button type="button" onClick={()=>download(file.id)} disabled={!!busy}>{busy===file.id?'Preparing download…':file.filename}</button> ({Number(file.bytes).toLocaleString()} bytes)</li>)}</ul></section>}</>}</>;
}
