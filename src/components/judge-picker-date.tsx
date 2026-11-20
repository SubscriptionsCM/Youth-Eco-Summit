import {validSourceDate} from '../domain/source-dates';

export function JudgePickerDate({source,entry}:{source:string;entry:{submitted_at?:unknown;imported_at?:unknown}}){
 const value=entry.submitted_at instanceof Date?entry.submitted_at.toISOString():entry.submitted_at;
 if(!validSourceDate(value))return <small>Original submission date not recorded</small>;
 const wallClock=source==='wordpress'&&!/(Z|[+-]\d{2}:\d{2})$/.test(value);
 const parsed=new Date(wallClock?value.replace(' ','T')+'Z':value);
 const label=new Intl.DateTimeFormat('en-GB',{timeZone:wallClock?'UTC':'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(parsed);
 return <small>Submitted <time dateTime={value.replace(' ','T')} title={value}>{label}</time></small>;
}
