'use client';
import Link from 'next/link';
import {useState} from 'react';
import {StatusBadge} from './portal-ui';
import {JudgePickerDate} from './judge-picker-date';
import {type Row,date} from './api';
import {Empty,Field,Pagination,ResourceState,useResource} from './shared';
import {formTitle,referenceForms} from '../domain/wordpress-forms';

export function ReferenceInbox({resource,initialFilters}:{resource:'reference-forms'|'wordpress-history';initialFilters:string}){
 const initial=new URLSearchParams(initialFilters);
 const [input,setInput]=useState(initial.get('q')||''),[query,setQuery]=useState(initial.get('q')||''),[formKey,setFormKey]=useState(initial.get('formKey')||''),[page,setPage]=useState(1);
 const [baseFilters,setBaseFilters]=useState(initialFilters);
 const params=new URLSearchParams(baseFilters);params.set('page',String(page));params.set('q',query);
 if(resource==='reference-forms')params.set('formKey',formKey);
 const records=useResource<Row>(`/api/admin/${resource}?${params}`),archive=resource==='wordpress-history';
 return <section><h2>{archive?'WordPress submission archive':'Submitted forms'}</h2><p>{archive?'Preserved source submissions and verified attachments.':'Registration, contact, partnership and competition submissions received through the website.'}</p><form className="form portal-filter-panel form-wide" onSubmit={e=>{e.preventDefault();setQuery(input);setPage(1);}}>
  <Field name="reference-query" title={archive?'Find by source entry or form ID':'Find by reference, form or school'} value={input} onChange={(e:React.ChangeEvent<HTMLInputElement>)=>setInput(e.target.value)}/>
  {!archive&&<Field name="reference-type" title="Form type"><select value={formKey} onChange={e=>{setFormKey(e.target.value);setPage(1);}}><option value="">All forms</option>{referenceForms.filter(f=>!f.key.startsWith('legacy-')||f.id===12146).map(f=><option key={f.key} value={f.key}>{formTitle(f)}</option>)}</select></Field>}
  <div className="actions"><button type="submit">Search submissions</button><button type="button" className="secondary" onClick={()=>{setInput('');setQuery('');setFormKey('');setBaseFilters('');setPage(1);}}>Clear filters</button><button type="button" className="secondary" onClick={records.reload}>Refresh</button></div></form><ResourceState {...records} retry={records.reload}/>{records.data&&<><p className="portal-result-count" role="status">{records.data.total} matching {records.data.total===1?'submission':'submissions'}. {archive?'Dates are preserved from the original WordPress records.':'Open a reference to see submitted details and files.'}</p>
  {!records.data.items.length?<Empty>No matching submissions.</Empty>:<div className="table-wrap" tabIndex={0} role="region" aria-label="Submission results"><table><thead><tr><th scope="col">Reference</th><th scope="col">Form</th><th scope="col">{archive?'Source status':'School'}</th><th scope="col">{archive?'Original date':'Submitted'}</th></tr></thead><tbody>{records.data.items.map((record:Row)=>{
   const form=referenceForms.find(f=>f.key===(record.form_key||record.formKey));const href=archive?`/history/${encodeURIComponent(record.id)}`:`/forms/${encodeURIComponent(record.form_key)}#saved=${encodeURIComponent(record.id)}`;
   return <tr key={record.id}><td><Link href={href}>{record.reference||record.sourceId}</Link></td><td>{form?formTitle(form):record.title||'Historical form'}</td><td>{archive?<StatusBadge value={record.status}/>:record.school_name||'—'}</td><td>{archive?<JudgePickerDate source="wordpress" entry={{submitted_at:record.createdAt}}/>:record.submitted_at?date(record.submitted_at):'Not recorded'}</td></tr>;
  })}</tbody></table></div>}
  <Pagination page={page} pageSize={records.data.pageSize} total={records.data.total} onPage={setPage}/>
 </>}</section>;
}
