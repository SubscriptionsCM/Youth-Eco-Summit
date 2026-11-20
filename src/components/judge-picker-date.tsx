import {date} from './api';

import {validSourceDate} from '../domain/source-dates';

export function JudgePickerDate({source,entry}:{source:string;entry:{submitted_at?:unknown;imported_at?:unknown}}){
 if(source!=='wordpress')return <small>Submitted {date(entry.submitted_at)}</small>;
 const value=entry.submitted_at;
 if(!validSourceDate(value))return <small>Original submission date not recorded</small>;
 return <small>Submitted <time dateTime={value.replace(' ','T')}>{value}</time> (WordPress record)</small>;
}
