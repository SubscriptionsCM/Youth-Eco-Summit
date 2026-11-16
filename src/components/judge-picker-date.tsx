import {date} from './api';

// WordPress stores a wall-clock value without a timezone. Display the source
// value rather than interpreting it in the reviewer's browser timezone.
function sourceDate(value:unknown):value is string {
 if(typeof value!=='string')return false;
 const match=/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?$/.exec(value);
 if(!match)return false;
 const [year,month,day,hour,minute,second]=match.slice(1).map(Number);
 const leap=year%4===0&&(year%100!==0||year%400===0);
 const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 return year>0&&month>=1&&month<=12&&day>=1&&day<=days[month-1]&&hour<24&&minute<60&&second<60;
}

export function JudgePickerDate({source,entry}:{source:string;entry:{submitted_at?:unknown;imported_at?:unknown}}){
 if(source!=='wordpress')return <small>Submitted {date(entry.submitted_at)}</small>;
 const value=entry.submitted_at;
 if(!sourceDate(value))return <small>Original submission date not recorded</small>;
 return <small>Submitted <time dateTime={value.replace(' ','T')}>{value}</time> (WordPress record)</small>;
}
