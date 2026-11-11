'use client';
import Link from 'next/link';
import {useState} from 'react';
import {type Row,date} from './api';
import {Empty,Field,Pagination,ResourceState,useResource} from './shared';
import {formTitle,referenceForms} from '../domain/wordpress-forms';

export function ReferenceInbox({resource,initialFilters}:{resource:'reference-forms'|'wordpress-history';initialFilters:string}){
 const initial=new URLSearchParams(initialFilters);
 const [input,setInput]=useState(initial.get('q')||''),[query,setQuery]=useState(initial.get('q')||''),[formKey,setFormKey]=useState(initial.get('formKey')||''),[page,setPage]=useState(1);
 const params=new URLSearchParams(initialFilters);params.set('page',String(page));params.set('q',query);
 if(resource==='reference-forms')params.set('formKey',formKey);
 const records=useResource<Row>(`/api/admin/${resource}?${params}`),archive=resource==='wordpress-history';
 return <section><h2>{archive?'WordPress submission archive':'Submitted forms'}</h2><p>{archive?'Preserved source submissions and verified attachments.':'Registration, contact, partnership and competition submissions received through the website.'}</p><form className="form" onSubmit={e=>{e.preventDefault();setQuery(input);setPage(1);}}>
  <Field name="reference-query" title={archive?'Find by source entry or form ID':'Find by reference, form or school'} value={input} onChange={(e:React.ChangeEvent<HTMLInputElement>)=>setInput(e.target.value)}/>
  {!archive&&<Field name="reference-type" title="Form type"><select value={formKey} onChange={e=>{setFormKey(e.target.value);setPage(1);}}><option value="">All forms</option>{referenceForms.filter(f=>!f.key.startsWith('legacy-')||f.id===12146).map(f=><option key={f.key} value={f.key}>{formTitle(f)}</option>)}</select></Field>}
  <button type="submit">Search submissions</button></form><ResourceState {...records} retry={records.reload}/>{records.data&&<>
  {!records.data.items.length?<Empty>No matching submissions.</Empty>:<div className="table-wrap"><table><thead><tr><th>Reference</th><th>Form</th><th>{archive?'Source':'School'}</th><th>Received</th></tr></thead><tbody>{records.data.items.map((record:Row)=>{
   const form=referenceForms.find(f=>f.key===(record.form_key||record.formKey));const href=archive?`/history/${encodeURIComponent(record.id)}`:`/forms/${encodeURIComponent(record.form_key)}#saved=${encodeURIComponent(record.id)}`;
   return <tr key={record.id}><td><Link href={href}>{record.reference||record.sourceId}</Link></td><td>{form?formTitle(form):record.title||'Historical form'}</td><td>{archive?record.source:record.school_name||'—'}</td><td>{record.submitted_at||record.createdAt?date(record.submitted_at||record.createdAt):'Retained from source'}</td></tr>;
  })}</tbody></table></div>}
  <Pagination page={page} pageSize={records.data.pageSize} total={records.data.total} onPage={setPage}/>
 </>}</section>;
}
