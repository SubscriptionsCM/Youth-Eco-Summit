'use client';
import {useState} from 'react';
import {formatDailyQCText,formatDailyQCCsv,type DailyQCReport} from '../domain/daily-qc-report';
import {type Row} from './api';
import {Errors,Field,Notice,ResourceState,useResource} from './shared';

const indiaToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function DailyQCReportPanel({filters,revision,selectedDate,onDateChange}:{filters:string;revision:string;selectedDate:string;onDateChange:(date:string)=>void}){
 const date=selectedDate||indiaToday();
 const [message,setMessage]=useState(''),[error,setError]=useState<unknown>(null);
 const params=new URLSearchParams({reportDate:date});
 const active=new URLSearchParams(filters);
 for(const key of ['year','schoolId','formKey'])if(active.get(key))params.set(key,active.get(key)!);
 const path=`/api/submission-report?${params}&revision=${encodeURIComponent(revision)}`;
 const resource=useResource<Row>(path),data=resource.dataPath===path&&!resource.loading&&!resource.error?resource.data:null;
 const report:DailyQCReport|null=data?{date,summary:data.summary,categories:data.categories}:null;
 const text=report?formatDailyQCText(report):'';
 const scopeLabel=data?[data.scope.year!=='all'?`Submission year: ${data.scope.year}`:'All submission years',data.schools.find((s:Row)=>s.id===data.scope.schoolId)?.name||'All schools',data.catalogue.find((c:Row)=>c.formKey===data.scope.formKey)?.title||'All categories'].join(' · '):'';
 async function copy(){setMessage('');setError(null);try{await navigator.clipboard.writeText(text);setMessage('Report copied. You can paste it into email or WhatsApp.');}catch{setError(new Error('Copy is unavailable in this browser. Select and copy the report text below, or download the text file.'));}}
 function download(format:'txt'|'csv'){
  if(!report)return;setError(null);setMessage('');
  try{const url=URL.createObjectURL(new Blob([format==='txt'?text:formatDailyQCCsv(report)],{type:format==='txt'?'text/plain;charset=utf-8':'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=`Youth-Eco-Summit-Daily-QC-${date}.${format}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setMessage(`${format.toUpperCase()} report downloaded.`);}catch(e){setError(e);}
 }
 return <section className="panel daily-qc-report" aria-labelledby="daily-qc-title"><h2 id="daily-qc-title">Daily Submission & QC Summary</h2><p>Choose a date to prepare the daily update in your team's report format.</p><div className="daily-report-controls"><Field name="reportDate" title="Report date" type="date" required value={date} max={indiaToday()} onChange={(e:React.ChangeEvent<HTMLInputElement>)=>{if(e.target.value){onDateChange(e.target.value);setMessage('');setError(null);}}}/><button type="button" className="secondary" onClick={resource.reload}>Refresh daily report</button></div><ResourceState {...resource} retry={resource.reload}/>{data&&<><p className="muted">{scopeLabel}. Totals are cumulative through {date}, using India time. “Today” means this selected date. Search and QC-status filters do not change this report.</p><p className="muted">Historical reports use recorded QC decisions and currently retained submissions and files. Offline checks without a recorded completion are pending. Changed submissions need a new check.</p>{data.summary.unknownDates>0&&<Notice>{data.summary.unknownDates} submitted records have no usable original date and are excluded from this dated report.</Notice>}<div className="actions"><button type="button" onClick={copy}>Copy report</button><button type="button" className="secondary" onClick={()=>download('txt')}>Download text</button><button type="button" className="secondary" onClick={()=>download('csv')}>Download CSV</button></div><Field name="dailyReportPreview" title="Report preview" hint="You can select this text to copy it manually."><textarea name="dailyReportPreview" readOnly value={text} rows={18} spellCheck={false}/></Field><p className="muted">Calculated from database records at {new Date(data.checkedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} (India time). Registration totals include submitted student, educator and school registration forms.</p></>}<Errors error={error}/>{message&&<Notice>{message}</Notice>}</section>;
}
