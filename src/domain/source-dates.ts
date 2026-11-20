/** Validate a recorded calendar date without normalizing impossible dates. */
export function validSourceDate(value:unknown):value is string {
 if(typeof value!=='string')return false;
 const match=/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?$/.exec(value);
 if(!match)return false;
 const [year,month,day,hour,minute,second]=match.slice(1).map(Number);
 const leap=year%4===0&&(year%100!==0||year%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 return year>0&&month>=1&&month<=12&&day>=1&&day<=days[month-1]&&hour<24&&minute<60&&second<60;
}
