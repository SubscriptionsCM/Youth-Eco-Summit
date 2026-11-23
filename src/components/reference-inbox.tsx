'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {StatusBadge} from './portal-ui';
import {JudgePickerDate} from './judge-picker-date';
import {ContactSubmissionDetails} from './contact-submission-summary';
import {type Row} from './api';
import {Empty,Field,Pagination,ResourceState,useResource} from './shared';
import {formTitle,referenceForms} from '../domain/wordpress-forms';
import {RegistrationDownload} from './registration-download';
const quickTypes=[['','All forms'],['student','Students'],['teacher','Educators'],['school','Schools'],[referenceForms.find(f=>f.id===12146)!.key,'Contact'],['partner','Partners']];
const availableForms=referenceForms.filter(f=>!f.key.startsWith('legacy-')||f.id===12146).map(f=>({key:f.key,title:formTitle(f)}));
function title(r:Row){return r.title||availableForms.find(f=>f.key===r.form_key)?.title||'Other form';}

export function ReferenceInbox({initialFilters}:{resource:'reference-forms'|'wordpress-history';initialFilters:string}){
 const initial=new URLSearchParams(initialFilters);
 const [input,setInput]=useState(initial.get('q')||''),[query,setQuery]=useState(initial.get('q')||'');
 const [formKey,setFormKey]=useState(initial.get('formKey')||''),[page,setPage]=useState(1),[baseFilters,setBaseFilters]=useState(initialFilters);
 const [layout,setLayout]=useState<'list'|'cards'>('list');
 useEffect(()=>{let saved:string|null=null;try{saved=localStorage.getItem('yes.inbox.layout');}catch{}setLayout(saved==='cards'||saved!=='list'&&window.matchMedia('(max-width:640px)').matches?'cards':'list');},[]);
 const params=new URLSearchParams(baseFilters);params.delete('source');params.set('page',String(page));params.set('q',query);params.set('formKey',formKey);
 const requestPath=`/api/admin/submission-inbox?${params}`,records=useResource<Row>(requestPath);
 const loading=records.loading||records.dataPath!==requestPath&&!records.error;
 const result=records.dataPath===requestPath&&!loading&&!records.error?records.data:null;
 const scoped=new URLSearchParams(baseFilters),schoolScoped=!!scoped.get('schoolId'),idScoped=!!scoped.get('id'),filtered=!!(query||formKey||schoolScoped||idScoped);
 const totals=result?.formTotals as Record<string,number>|undefined;
 const forms=[...new Map([...availableForms,...(records.data?.formOptions||[]),...(formKey&&!availableForms.some(f=>f.key===formKey)&&!records.data?.formOptions?.some((f:Row)=>f.key===formKey)?[{key:formKey,title:'Selected form'}]:[])].map(f=>[f.key,f])).values()];
 function chooseForm(key:string){setFormKey(key);setPage(1);}
 function clear(){setInput('');setQuery('');setFormKey('');setBaseFilters('');setPage(1);}
 function changeLayout(next:'list'|'cards'){setLayout(next);try{localStorage.setItem('yes.inbox.layout',next);}catch{}}
 function removeScope(key:string){const next=new URLSearchParams(baseFilters);next.delete(key);setBaseFilters(next.toString());setPage(1);}
 function href(r:Row){return r.href||`/forms/${encodeURIComponent(r.form_key)}#saved=${encodeURIComponent(r.id)}`;}
 function details(r:Row){return <><JudgePickerDate source={r.dateSource||'portal'} entry={r}/>{typeof r.file_count==='number'&&<small>{r.file_count} {r.file_count===1?'attachment':'attachments'}</small>}</>;}
 return <section className="submission-inbox" aria-label="Forms and submissions" aria-busy={loading}>
  <RegistrationDownload/>
  <form className="inbox-filter-bar" onSubmit={e=>{e.preventDefault();setQuery(input);setPage(1);}}>
   <div className="inbox-search-row"><Field name="reference-query" title="Search submissions" type="search" maxLength={200} value={input} onChange={(e:React.ChangeEvent<HTMLInputElement>)=>setInput(e.target.value)} placeholder="Reference, person, school, email, phone or message"/>
    <Field name="reference-type" title="All form types"><select name="reference-type" value={formKey} onChange={e=>chooseForm(e.target.value)}><option value="">All forms</option>{forms.map(f=><option key={f.key} value={f.key}>{f.title}</option>)}</select></Field><button type="submit">Search</button></div>
   <div className="inbox-quick-types" role="group" aria-label="Filter by form type">{quickTypes.map(([key,label])=>{const count=totals?(key?totals[key]||0:Object.values(totals).reduce((n,v)=>n+v,0)):null;return <button key={key} type="button" className="secondary" aria-pressed={formKey===key} onClick={()=>chooseForm(key)}>{label}{count!==null&&<span>{count.toLocaleString('en-IN')}</span>}</button>;})}</div>
   {input!==query&&<small className="inbox-pending-query">Select Search to apply your text.</small>}
   {filtered&&<div className="inbox-active-filters" aria-label="Applied filters">
    {query&&<button type="button" className="secondary" onClick={()=>{setInput('');setQuery('');setPage(1);}}>Clear search: {query}</button>}
    {formKey&&<button type="button" className="secondary" onClick={()=>chooseForm('')}>Clear type: {quickTypes.find(([k])=>k===formKey)?.[1]||forms.find(f=>f.key===formKey)?.title||'Selected form'}</button>}
    {schoolScoped&&<button type="button" className="secondary" onClick={()=>removeScope('schoolId')}>Clear selected school</button>}
    {idScoped&&<button type="button" className="secondary" onClick={()=>removeScope('id')}>Clear specific submission</button>}
    <button type="button" className="inbox-clear-all" onClick={clear}>Clear filters</button></div>}
  </form>
  <div className="inbox-results-bar"><div><h2>Forms & submissions</h2><p className="portal-result-count" role="status">{loading?'Updating submissions…':records.error?'Results could not be loaded.':result?`${result.total.toLocaleString('en-IN')} matching ${result.total===1?'submission':'submissions'}${filtered?' with your current filters':''}`:'Loading submissions…'}</p></div>
   <div className="inbox-results-actions"><div className="inbox-layout-switch" role="group" aria-label="Submission layout"><button type="button" className="secondary" aria-label="List view" aria-pressed={layout==='list'} onClick={()=>changeLayout('list')}>List</button><button type="button" className="secondary" aria-label="Card view" aria-pressed={layout==='cards'} onClick={()=>changeLayout('cards')}>Cards</button></div><button type="button" className="secondary inbox-refresh" onClick={records.reload} disabled={loading}>{loading?'Refreshing…':'Refresh'}</button></div></div>
  <ResourceState loading={loading} error={records.error} retry={records.reload}/>
  {result&&<>{!result.items.length?<Empty><h3>{result.total>0?'No submissions on this page':filtered?'No submissions match these filters':'No submissions yet'}</h3><p>{filtered?'Try a different reference, name, school, email, phone, message or form type.':'Received forms will appear here, ready for review.'}</p>{result.total>0?<button type="button" className="secondary" onClick={()=>setPage(1)}>Go to first page</button>:filtered&&<button type="button" className="secondary" onClick={clear}>Clear filters</button>}</Empty>
   :layout==='cards'?<div className="submission-card-grid">{result.items.map((r:Row)=><article className="submission-card" key={r.key||r.id}><div className="submission-card-content"><div className="portal-card-top"><span className="portal-reference">{r.reference}</span><StatusBadge value={r.status}/></div><h3>{title(r)}</h3>{r.contact?<ContactSubmissionDetails contact={r.contact}/>:<p className="submission-school">{[r.name,r.school_name].filter(Boolean).join(' · ')||'School not recorded'}</p>}<div className="submission-card-meta">{details(r)}</div><Link className="submission-open" href={href(r)} aria-label={`View details for ${r.reference}: ${title(r)}`}>View details</Link></div></article>)}</div>
   :<><small className="inbox-table-help">Scroll across the list to see all columns on a smaller screen.</small><div className="table-wrap submission-table" tabIndex={0} role="region" aria-label="Submission results"><table><colgroup><col className="inbox-submission-column"/><col className="inbox-person-column"/><col className="inbox-submitted-column"/></colgroup><thead><tr><th scope="col">Submission</th><th scope="col">Person / school / contact</th><th scope="col">Submitted</th></tr></thead><tbody>{result.items.map((r:Row)=><tr key={r.key||r.id}><td><Link className="submission-title" href={href(r)} aria-label={`Open ${title(r)}: ${r.reference}`}>{title(r)}</Link><span className="portal-reference">{r.reference}</span><StatusBadge value={r.status}/><Link className="submission-detail-link" href={href(r)} aria-label={`View details for ${r.reference}`}>View details</Link></td><td>{r.contact?<ContactSubmissionDetails contact={r.contact}/>:([r.name,r.school_name].filter(Boolean).join(' · ')||'Not recorded')}</td><td>{details(r)}</td></tr>)}</tbody></table></div></>}
   <Pagination page={page} pageSize={result.pageSize} total={result.total} onPage={setPage}/></>}
 </section>;
}
