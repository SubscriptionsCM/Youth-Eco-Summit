'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {StatusBadge} from './portal-ui';
import {JudgePickerDate} from './judge-picker-date';
import {type Row,date} from './api';
import {Empty,Field,Pagination,ResourceState,useResource} from './shared';
import {formTitle,referenceForms} from '../domain/wordpress-forms';

const quickTypes=[['','All forms'],['student','Students'],['teacher','Educators'],['school','Schools'],[referenceForms.find(form=>form.id===12146)!.key,'Contact'],['partner','Partners']];
const availableForms=referenceForms.filter(form=>!form.key.startsWith('legacy-')||form.id===12146);
function title(record:Row){const form=referenceForms.find(f=>f.key===(record.form_key||record.formKey));return form?formTitle(form):record.title||'Historical form';}

export function ReferenceInbox({resource,initialFilters}:{resource:'reference-forms'|'wordpress-history';initialFilters:string}){
 const initial=new URLSearchParams(initialFilters),archive=resource==='wordpress-history';
 const [input,setInput]=useState(initial.get('q')||''),[query,setQuery]=useState(initial.get('q')||'');
 const [formKey,setFormKey]=useState(archive?'':initial.get('formKey')||''),[page,setPage]=useState(1),[baseFilters,setBaseFilters]=useState(initialFilters);
 const [layout,setLayout]=useState<'list'|'cards'>('list');
 useEffect(()=>{
  let saved:string|null=null;try{saved=localStorage.getItem('yes.inbox.layout');}catch{}
  setLayout(saved==='cards'||saved!=='list'&&window.matchMedia('(max-width:640px)').matches?'cards':'list');
 },[]);
 const params=new URLSearchParams(baseFilters);params.set('page',String(page));params.set('q',query);
 if(archive){params.delete('formKey');params.delete('schoolId');}
 if(!archive)params.set('formKey',formKey);
 const requestPath=`/api/admin/${resource}?${params}`,records=useResource<Row>(requestPath);
 const current=records.dataPath===requestPath,loading=records.loading||!current&&!records.error;
 const result=current&&!loading&&!records.error?records.data:null;
 const scoped=new URLSearchParams(baseFilters),schoolScoped=!archive&&!!scoped.get('schoolId'),idScoped=!!scoped.get('id');
 const filtered=!!(query||formKey||schoolScoped||idScoped),totals=result?.formTotals as Record<string,number>|undefined;
 function chooseForm(key:string){setFormKey(key);setPage(1);}
 function clear(){setInput('');setQuery('');setFormKey('');setBaseFilters('');setPage(1);}
 function changeLayout(next:'list'|'cards'){setLayout(next);try{localStorage.setItem('yes.inbox.layout',next);}catch{}}
 function removeScope(key:string){const next=new URLSearchParams(baseFilters);next.delete(key);setBaseFilters(next.toString());setPage(1);}
 function href(record:Row){return archive?`/history/${encodeURIComponent(record.id)}`:`/forms/${encodeURIComponent(record.form_key)}#saved=${encodeURIComponent(record.id)}`;}
 function submittedDate(record:Row){return archive?<JudgePickerDate source="wordpress" entry={{submitted_at:record.createdAt}}/>:record.submitted_at?date(record.submitted_at):'Not recorded';}
 return <section className="submission-inbox" aria-label={archive?'Archived submissions':'Website submissions'} aria-busy={loading}>
  <form className="inbox-filter-bar" onSubmit={event=>{event.preventDefault();setQuery(input);setPage(1);}}>
   <div className="inbox-search-row">
    <Field name="reference-query" title={archive?'Search archive':'Search submissions'} type="search" maxLength={200} value={input} onChange={(event:React.ChangeEvent<HTMLInputElement>)=>setInput(event.target.value)} placeholder={archive?'Original entry or form ID':'Reference or school name'}/>
    {!archive&&<Field name="reference-type" title="All form types"><select name="reference-type" value={formKey} onChange={event=>chooseForm(event.target.value)}><option value="">All forms</option>{availableForms.map(form=><option key={form.key} value={form.key}>{formTitle(form)}</option>)}</select></Field>}
    <button type="submit">Search</button>
   </div>
   {!archive&&<div className="inbox-quick-types" role="group" aria-label="Filter by form type">{quickTypes.map(([key,label])=>{
    const count=totals&&!records.loading&&!records.error?(key?totals[key]||0:Object.values(totals).reduce((sum,value)=>sum+value,0)):null;
    return <button key={key} type="button" className="secondary" aria-pressed={formKey===key} onClick={()=>chooseForm(key)}>{label}{count!==null&&<span>{count.toLocaleString('en-IN')}</span>}</button>;
   })}</div>}
   {input!==query&&<small className="inbox-pending-query">Select Search to apply your text.</small>}
   {filtered&&<div className="inbox-active-filters" aria-label="Applied filters">
    {query&&<button type="button" className="secondary" onClick={()=>{setInput('');setQuery('');setPage(1);}}>Clear search: {query}</button>}
    {formKey&&<button type="button" className="secondary" onClick={()=>{setFormKey('');setPage(1);}}>Clear type: {quickTypes.find(([key])=>key===formKey)?.[1]||availableForms.find(form=>form.key===formKey)?.title||'Selected form'}</button>}
    {schoolScoped&&<button type="button" className="secondary" onClick={()=>removeScope('schoolId')}>Clear selected school</button>}
    {idScoped&&<button type="button" className="secondary" onClick={()=>removeScope('id')}>Clear specific submission</button>}
    <button type="button" className="inbox-clear-all" onClick={clear}>Clear filters</button>
   </div>}
  </form>
  <div className="inbox-results-bar">
   <div><h2>{archive?'Original submissions':'Submitted forms'}</h2><p className="portal-result-count" role="status">{loading?'Updating submissions…':records.error?'Results could not be loaded.':result?`${result.total.toLocaleString('en-IN')} matching ${result.total===1?'submission':'submissions'}${filtered?' with your current filters':''}`:'Loading submissions…'}</p></div>
   <div className="inbox-results-actions"><div className="inbox-layout-switch" role="group" aria-label="Submission layout"><button type="button" className="secondary" aria-label="List view" aria-pressed={layout==='list'} onClick={()=>changeLayout('list')}>List</button><button type="button" className="secondary" aria-label="Card view" aria-pressed={layout==='cards'} onClick={()=>changeLayout('cards')}>Cards</button></div><button type="button" className="secondary inbox-refresh" onClick={records.reload} disabled={loading}>{loading?'Refreshing…':'Refresh'}</button></div>
  </div>
  {archive&&<p className="inbox-date-note">Dates below are the original WordPress submission dates.</p>}
  <ResourceState loading={loading} error={records.error} retry={records.reload}/>
  {result&&!records.error&&<>
   {!result.items.length?<Empty><h3>{result.total>0?'No submissions on this page':filtered?'No submissions match these filters':'No submissions yet'}</h3><p>{archive?'Try a different original entry or form ID.':filtered?'Try a different reference, school name or form type.':'Received forms will appear here, ready for review.'}</p>{result.total>0?<button type="button" className="secondary" onClick={()=>setPage(1)}>Go to first page</button>:filtered?<button type="button" className="secondary" onClick={clear}>Clear filters</button>:!archive&&<Link href="/admin/wordpress-history">Find an earlier submission in the archive</Link>}</Empty>
   :layout==='cards'?<div className="submission-card-grid">{result.items.map((record:Row)=><article className="submission-card" key={record.id}>
    <Link className="submission-card-link" href={href(record)} aria-label={`Open submission ${record.reference||record.sourceId}: ${title(record)}`}><div className="portal-card-top"><span className="portal-reference">{record.reference||record.sourceId}</span>{archive&&<StatusBadge value={record.status}/>}</div>
    <h3>{title(record)}</h3><p className="submission-school">{archive?'WordPress archive':record.school_name||'School not recorded'}</p>
    <div className="submission-card-meta"><span>{archive?'Originally submitted':'Submitted'}</span><div>{submittedDate(record)}</div>{!archive&&typeof record.file_count==='number'&&<span>{record.file_count} {record.file_count===1?'verified file':'verified files'}</span>}</div>
    <span className="submission-open">Open submission</span></Link>
   </article>)}</div>
   :<><small className="inbox-table-help">Scroll across the list to see all columns on a smaller screen.</small><div className="table-wrap submission-table" tabIndex={0} role="region" aria-label="Submission results"><table><thead><tr><th scope="col">Submission</th><th scope="col">{archive?'Source status':'School'}</th><th scope="col">{archive?'Original date':'Submitted'}</th></tr></thead><tbody>{result.items.map((record:Row)=><tr key={record.id}>
    <td><Link className="submission-title" href={href(record)} aria-label={`Open ${title(record)}: ${record.reference||record.sourceId}`}>{title(record)}</Link><span className="portal-reference">{record.reference||record.sourceId}</span></td><td>{archive?<StatusBadge value={record.status}/>:record.school_name||'—'}</td><td>{submittedDate(record)}</td>
   </tr>)}</tbody></table></div></>}
   <Pagination page={page} pageSize={result.pageSize} total={result.total} onPage={setPage}/>
  </>}
 </section>;
}
