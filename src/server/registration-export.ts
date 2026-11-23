import ExcelJS from 'exceljs';
import type {Db} from './db';
import {AppError,audit,id,type Actor} from './core';
import {loadSubmissionRecords,requireActive,type SubmissionRecord} from './submission-records';
import {referenceForms,plainText,fieldOptions,formTitle,isFieldVisible,type ReferenceField} from '../domain/wordpress-forms';
import {displayReferenceValue} from '../domain/reference-values';
import {submissionDateOrder} from '../domain/source-dates';

const roles=[['Students','student'],['Educators','teacher'],['School registrations','school']] as const;
type SchoolRow={id:string;reference:string;name:string;address:string;city:string;state:string;postal_code:string;status:string;registered_at:Date|string;coordinator:string|null};
type ContactRow={school_id:string;name:string;role:string;email:string;phone:string};
const sensitive=/password|passcode|verification.?code|authenticator|\botp\b|captcha|token|secret/i;
const label=(field:ReferenceField)=>plainText(field.field_label||field.id).replace(/\s+/g,' ').replace(/\s*\*$/,'').trim();
function fieldValue(field:ReferenceField,answer:unknown){
 if(answer===undefined||answer===null)return '';
 if(['select','radio','checkbox'].includes(field.type)&&typeof answer!=='boolean'){
  const choices=fieldOptions(field);
  return (Array.isArray(answer)?answer:[answer]).map(value=>plainText(choices.find(option=>String(option.value)===String(value))?.label??String(value))).join(', ');
 }
 return plainText(displayReferenceValue(field.type,answer));
}
function originalFields(record:SubmissionRecord){
 const result:Record<string,string>={},seen=new Map<string,number>();
 for(const field of referenceForms.find(form=>form.key===record.formKey)?.fields||[]){
  if(['html','hidden','password','section','group','page-break','upload'].includes(field.type)||sensitive.test(field.id+' '+label(field)))continue;
  const title=label(field),occurrence=(seen.get(title)||0)+1;seen.set(title,occurrence);
  if(!isFieldVisible(field,record.answers))continue;
  const value=fieldValue(field,record.answers[field.id]);
  if(value)result[title+(occurrence>1?` (additional ${occurrence})`:'')]=value;
 }
 return result;
}
async function registrationSnapshot(db:Db){
 return db.transaction(async tx=>{
  await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const capturedAt=new Date((await tx.query('SELECT transaction_timestamp() AS captured_at')).rows[0].captured_at).toISOString();
  const records=(await loadSubmissionRecords(tx,{includeUnknown:true})).filter(record=>['student','teacher','school'].includes(record.kind));
  const {rows:directory}=await tx.query<SchoolRow>('SELECT id,reference,name,address,city,state,postal_code,status,registered_at,coordinator FROM schools WHERE trashed_at IS NULL AND NOT purging ORDER BY lower(name),reference');
  const {rows:contacts}=await tx.query<ContactRow>('SELECT school_id,name,role,email,phone FROM school_contacts ORDER BY name,email');
  const schools=new Map(directory.map(school=>[school.id,school]));
  const completed=records.filter(record=>record.status==='submitted');
  const entries=completed.map(record=>{
   const fields=originalFields(record),form=referenceForms.find(form=>form.key===record.formKey);
   const recordedSchool=Object.entries(fields).find(([key,value])=>/^school name/i.test(key)&&value&&!/^(other\b|not listed\b)/i.test(value))?.[1]||record.recordedSchoolName||'';
   const person=record.answers[record.kind==='school'?'name-2':record.kind==='teacher'?'name-3':'name-1'];
   return {kind:record.kind,reference:record.reference,displayDate:submissionDateOrder(record.submittedAt,record.source),submittedAt:record.submittedAt||'',name:plainText(displayReferenceValue('name',person))||record.name,schoolName:schools.get(record.schoolId||'')?.name||recordedSchool,schoolReference:schools.get(record.schoolId||'')?.reference||'',email:record.email,phone:plainText(record.answers[record.kind==='teacher'?'phone-4':'phone-1']||''),formTitle:form?formTitle(form):record.title,fields};
  }).sort((a,b)=>b.displayDate.localeCompare(a.displayDate)||a.reference.localeCompare(b.reference));
  return {capturedAt,entries,excludedIncomplete:records.length-completed.length,directory:directory.map(school=>({...school,contacts:contacts.filter(contact=>contact.school_id===school.id)}))};
 });
}
function textCell(value:unknown):string|number{
 if(typeof value==='number')return value;
 const text=String(value??'');
 if(text.length>32767)throw new AppError(422,'A registration field exceeds the Excel cell limit. Contact support to export this record.');
 // ExcelJS writes strings as literal string cells, including values beginning with =, +, - or @.
 return text;
}
function table(book:ExcelJS.Workbook,name:string,headers:string[],rows:unknown[][],note:string){
 if(rows.length>1_048_571)throw new AppError(422,'This export exceeds the Excel row limit. Contact support for a larger export.');
 const sheet=book.addWorksheet(name,{views:[{state:'frozen',ySplit:5,xSplit:2,showGridLines:false}]});
 sheet.getCell('A2').value=name;sheet.getCell('A2').font={bold:true,size:16,color:{argb:'FF4E3E7F'}};
 sheet.getCell('A3').value=note;
 sheet.getRow(5).values=headers;
 for(const row of rows)sheet.addRow(row.map(textCell));
 sheet.autoFilter={from:{row:5,column:1},to:{row:Math.max(5,rows.length+5),column:headers.length}};
 sheet.columns.forEach((column,index)=>{column.width=index===4?48:index===6?36:28;column.numFmt='@';});
 sheet.getRow(5).height=45;sheet.getRow(5).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(5).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF4E3E7F'}};
 sheet.eachRow(row=>{row.alignment={vertical:'top',wrapText:true};});
 return sheet;
}
export async function exportRegistrations(db:Db,actor:Actor,params:URLSearchParams){
 await requireActive(db,actor,['owner','admin']);
 if(params.get('format')!=='xlsx'||[...params.keys()].some(key=>!['resource','format'].includes(key)))throw new AppError(422,'The registration workbook includes all completed registrations. Use format=xlsx without inbox filters.');
 const snapshot=await registrationSnapshot(db),book=new ExcelJS.Workbook();
 book.creator='Youth Eco Summit';book.created=new Date(snapshot.capturedAt);book.calcProperties.fullCalcOnLoad=true;
 const overview=book.addWorksheet('Overview',{views:[{showGridLines:false}]});
 overview.getColumn(1).width=52;overview.getColumn(2).width=30;overview.getCell('A2').value='Youth Eco Summit registrations';overview.getCell('A2').font={bold:true,size:16};
 overview.getCell('A3').value='Exported (IST)';overview.getCell('B3').value=submissionDateOrder(snapshot.capturedAt,'portal');
 overview.getRow(5).values=['Registration type','Completed forms'];
 const counts:Record<string,number>={};
 for(const [name,kind] of roles){
  const records=snapshot.entries.filter(record=>record.kind===kind);counts[kind]=records.length;
  const fields=[...new Set(records.flatMap(record=>Object.keys(record.fields)))];
  const common=['Registration reference','Submitted (website time)','Status','Name','School name','Permanent school ID','Email','Contact phone','Original form','Original timestamp'];
  const used=new Set(common.map(header=>header.toLowerCase()));
  const headers=fields.map(field=>{let header=used.has(field.toLowerCase())?'Original '+field:field,index=2;while(used.has(header.toLowerCase()))header=field+` (additional ${index++})`;used.add(header.toLowerCase());return header;});
  const rows=records.map(record=>[record.reference,record.displayDate,'Submitted',record.name,record.schoolName,record.schoolReference,record.email,record.phone,record.formTitle,record.submittedAt,...fields.map(field=>record.fields[field]||'')]);
  table(book,name,[...common,...headers],rows,`${records.length} completed forms. All years; incomplete drafts excluded.`);
  const row=6+roles.findIndex(([title])=>title===name);overview.getCell(row,1).value=name;overview.getCell(row,2).value={formula:`COUNTA('${name}'!A6:A${Math.max(6,records.length+5)})`,result:records.length};
 }
 overview.getCell('A9').value='Total completed registration forms';overview.getCell('B9').value={formula:'SUM(B6:B8)',result:snapshot.entries.length};
 const unique=(contacts:ContactRow[],key:'name'|'role'|'email'|'phone')=>[...new Set(contacts.map(contact=>contact[key]).filter(Boolean))].join('\n');
 table(book,'School directory',['Permanent school ID','School name','Status','City','State','Address','PIN code','Coordinator','Contact names','Contact roles','Contact emails','Contact phones','Directory record date (IST)'],snapshot.directory.map(school=>[school.reference,school.name,school.status,school.city,school.state,school.address,school.postal_code,school.coordinator,unique(school.contacts,'name'),unique(school.contacts,'role'),unique(school.contacts,'email'),unique(school.contacts,'phone'),school.registered_at?submissionDateOrder(new Date(school.registered_at).toISOString(),'portal'):'']),'Current school branches, including active, pending and inactive records.');
 overview.getCell('A12').value='School directory records';overview.getCell('B12').value={formula:`COUNTA('School directory'!A6:A${Math.max(6,snapshot.directory.length+5)})`,result:snapshot.directory.length};
 overview.getCell('A14').value='Incomplete registrations excluded';overview.getCell('B14').value=snapshot.excludedIncomplete;
 overview.getCell('A17').value='Totals count submitted forms, not unique people. Older registrations are included.';
 overview.getCell('A18').value='The school directory is a separate branch list, not additional registration forms.';
 overview.getCell('A19').value='Displayed dates follow the website’s India reporting time. Original timestamps are retained.';
 overview.getCell('A21').value='Source: https://youthecosummit.com/admin/reference-forms';
 const buffer=await book.xlsx.writeBuffer();
 await db.transaction(async tx=>{
  await requireActive(tx,actor,['owner','admin']);
  await audit(tx,actor,'export.download','exports',id(),{resource:'registrations',format:'xlsx',completedRegistrations:snapshot.entries.length,counts,excludedIncomplete:snapshot.excludedIncomplete,schoolDirectory:snapshot.directory.length,capturedAt:snapshot.capturedAt});
 });
 const date=submissionDateOrder(snapshot.capturedAt,'portal').slice(0,10);
 return new Response(new Uint8Array(buffer as ArrayBuffer),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="Youth-Eco-Summit-registrations-${date}.xlsx"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
