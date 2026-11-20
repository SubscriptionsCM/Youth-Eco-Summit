import {plainText} from '../domain/wordpress-forms';
import {validSourceDate} from '../domain/source-dates';

type ObjectValue=Record<string,unknown>;
export type SupplementalSubmission={
 engine:'elementor'|'formidable';formKey:string;title:string;submittedAt:string|null;
 status:'submitted'|'draft'|'other';name:string;schoolName:string;
 fields:{id:string;type:'text';label:string;value:string}[];
};
const object=(v:unknown):v is ObjectValue=>!!v&&typeof v==='object'&&!Array.isArray(v);
const labels:Record<string,string>={
 fname:'First name',first_name:'First name',lanme:'Last name',lname:'Last name',last_name:'Last name',name:'Name',
 email:'Email',phone:'Phone',pincode:'Postal code',postal_code:'Postal code',who:'Participant role',
 school:'School',school_name:'School',message:'Message',subject:'Subject'
};
// These are presentation fields only. Never derive access or identity grants here.
function safeText(value:unknown,max=2000){
 if(typeof value!=='string'||value.length>max)return '';
 const text=plainText(value);
 if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)||/(?:https?:|s3:|file:|javascript:|data:|www\.)/i.test(text))return '';
 return text;
}
function segment(value:unknown){
 const text=typeof value==='string'?value:typeof value==='number'&&Number.isSafeInteger(value)?String(value):'';
 return /^[A-Za-z0-9_]{1,100}$/.test(text)?text:'unknown';
}
function date(row:ObjectValue){
 if(validSourceDate(row.created_at))return row.created_at;
 if(validSourceDate(row.created_at_gmt))return /(?:Z|[+-]\d{2}:\d{2})$/.test(row.created_at_gmt)?row.created_at_gmt:row.created_at_gmt.replace(' ','T')+'Z';
 return null;
}
/** Safe, read-only presentation of known supplemental exporter envelopes.
 * Callers must verify the retained payload checksum before using this result.
 * Numeric Formidable field IDs and opaque Elementor IDs need verified field
 * definitions before display; logs, row metadata and arbitrary fields stay private.
 */
export function supplementalSubmission(payload:unknown):SupplementalSubmission|null{
 if(!object(payload)||!object(payload.row)||typeof payload.source_table!=='string')return null;
 const engine=/^(?:[A-Za-z0-9_]+_)?e_submissions$/.test(payload.source_table)?'elementor'
  :/^(?:[A-Za-z0-9_]+_)?frm_items$/.test(payload.source_table)?'formidable':null;
 if(!engine)return null;
 const row=payload.row,fields:SupplementalSubmission['fields']=[];
 if(engine==='elementor'&&Array.isArray(payload.values)){
  const candidates=new Map<string,unknown[]>();
  for(const item of payload.values){
   if(!object(item)||typeof item.key!=='string'||!Object.hasOwn(labels,item.key))continue;
   const values=candidates.get(item.key)||[];values.push(item.value);candidates.set(item.key,values);
  }
  for(const [key,raw] of candidates){
   const values=raw.map(v=>safeText(v));
   if(values[0]&&values.every(v=>v===values[0]))fields.push({id:key,type:'text',label:labels[key],value:values[0]});
  }
 }
 const values=new Map(fields.map(f=>[f.id,f.value]));
 const first=(keys:string[])=>keys.map(k=>values.get(k)).find(Boolean)||'';
 const draft=row.is_draft,explicitDraft=draft!==undefined&&draft!==null&&draft!==false&&draft!==0&&!(typeof draft==='string'&&['','0','false'].includes(draft.trim().toLowerCase()));
 const sourceStatus=typeof row.status==='string'?row.status.trim().toLowerCase():'';
 const status:SupplementalSubmission['status']=explicitDraft||sourceStatus==='draft'?'draft'
  :engine==='formidable'&&draft!==undefined||['new','read','active','submitted','completed'].includes(sourceStatus)?'submitted':'other';
 return {engine,formKey:engine==='elementor'?`other-elementor-${segment(row.post_id)}-${segment(row.element_id)}`:`other-formidable-${segment(row.form_id)}`,
  title:engine==='elementor'?safeText(row.form_name,200)||'Other form':'Other form',submittedAt:date(row),status,
  name:first(['name'])||[first(['fname','first_name']),first(['lanme','lname','last_name'])].filter(Boolean).join(' '),
  schoolName:first(['school_name','school']),fields};
}
