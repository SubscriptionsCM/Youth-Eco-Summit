import {expect,it} from 'vitest';
import {supplementalSubmission} from '../src/server/supplemental-submission';

const elementor=(row:Record<string,unknown>={},values:unknown[]=[])=>({source_table:'wp_e_submissions',row:{post_id:'4326',element_id:'15d2a19',form_name:'Get involved',created_at:'2024-03-02 12:34:56',status:'new',...row},values,actions_log:[{message:'PRIVATE LOG'}]});

it('retains original Elementor date and form identity without inferring classification or ownership',()=>{
 const result=supplementalSubmission(elementor({user_id:7,user_ip:'PRIVATE IP'}));
 expect(result).toMatchObject({engine:'elementor',formKey:'other-elementor-4326-15d2a19',title:'Get involved',submittedAt:'2024-03-02 12:34:56',status:'submitted',name:'',schoolName:'',fields:[]});
 expect(JSON.stringify(result)).not.toMatch(/user_id|PRIVATE|owner|schoolId|competition|registration/);
});

it('exposes only allowlisted scalar text and drops opaque, credential, internal and URL fields',()=>{
 const payload=elementor({},[
  {key:'fname',value:'<b>Ada</b>'},{key:'lanme',value:'Lovelace'},
  {key:'email',value:'ada@example.test'},{key:'phone',value:'+91 1111111111'},
  {key:'pincode',value:'100001'},{key:'who',value:'Educator'},
  {key:'school_name',value:'Green School'},
  {key:'password',value:'PRIVATE PASSWORD'},{key:'field_65f0b6c',value:'PRIVATE UNKNOWN'},
  {key:'_yes_owner_user_id',value:'PRIVATE OWNER'},{key:'storage_key',value:'PRIVATE STORAGE'},
  {key:'message',value:'https://private.example.test/object?token=PRIVATE'},
  {key:'name',value:{password:'PRIVATE OBJECT'}},{key:'first_name',value:'https://private.example.test/object'}
 ]);
 const before=JSON.stringify(payload),result=supplementalSubmission(payload)!;
 expect(result.name).toBe('Ada Lovelace');expect(result.schoolName).toBe('Green School');
 expect(result.fields.map(f=>f.id)).toEqual(['fname','lanme','email','phone','pincode','who','school_name']);
 expect(JSON.stringify(result)).not.toMatch(/PRIVATE|password|storage_key|https:|_yes/);
 expect(JSON.stringify(payload)).toBe(before);
});

it('fails closed on duplicate conflicting fields and invalid dates, retaining legitimate drafts',()=>{
 const result=supplementalSubmission(elementor({created_at:'2024-02-30 12:34:56',status:'draft'},[{key:'fname',value:'Ada'},{key:'fname',value:'Grace'}]))!;
 expect(result.submittedAt).toBeNull();expect(result.status).toBe('draft');expect(result.name).toBe('');expect(result.fields).toEqual([]);
});

it('supports Formidable envelope dates and draft status while withholding unmapped numeric metadata',()=>{
 const payload={source_table:'custom_frm_items',row:{form_id:'8',created_at:'2022-05-09 10:11:12',is_draft:'1',user_id:42,ip:'PRIVATE IP'},meta:[{field_id:7,meta_value:'PRIVATE UNMAPPED'}]};
 expect(supplementalSubmission(payload)).toMatchObject({engine:'formidable',formKey:'other-formidable-8',title:'Other form',submittedAt:'2022-05-09 10:11:12',status:'draft',name:'',schoolName:'',fields:[]});
 expect(JSON.stringify(supplementalSubmission(payload))).not.toMatch(/PRIVATE|user_id|schoolId|meta_value/);
 expect(supplementalSubmission({...payload,row:{...payload.row,is_draft:'0'}})?.status).toBe('submitted');
});

it('recognizes only exact supported table suffixes and uses stable distinct fallback identities',()=>{
 expect(supplementalSubmission({form_id:1,meta:[]})).toBeNull();
 expect(supplementalSubmission({...elementor(),source_table:'wp_e_submissions_actions_log'})).toBeNull();
 expect(supplementalSubmission({...elementor(),row:null})).toBeNull();
 const a=supplementalSubmission(elementor({element_id:'one',form_name:'<b>Enquiry</b>'}))!;
 const b=supplementalSubmission(elementor({element_id:'two'}))!;
 expect(a.formKey).not.toBe(b.formKey);expect(a.title).toBe('Enquiry');
});

it('uses explicit GMT only when no valid original local timestamp exists',()=>{
 const both=supplementalSubmission(elementor({created_at_gmt:'2024-03-02 07:04:56'}))!;
 expect(both.submittedAt).toBe('2024-03-02 12:34:56');
 const gmt=supplementalSubmission(elementor({created_at:null,created_at_gmt:'2024-03-02 07:04:56'}))!;
 expect(gmt.submittedAt).toBe('2024-03-02T07:04:56Z');
 expect(supplementalSubmission(elementor({status:'spam'}))?.status).toBe('other');
});

it('rejects malformed or oversized values and prototype keys without reflecting source metadata',()=>{
 const result=supplementalSubmission(elementor({meta:{secret:'PRIVATE'},referer:'https://private.example.test'},[
  {key:'__proto__',value:'PRIVATE'}, {key:'constructor',value:'PRIVATE'},
  {key:'name',value:'A'.repeat(2001)},{key:'email',value:['PRIVATE']},
  {key:'message',value:'Hello\u0000PRIVATE'},{key:'subject',value:'<b>Our enquiry</b>'}
 ]))!;
 expect(result.fields).toEqual([{id:'subject',type:'text',label:'Subject',value:'Our enquiry'}]);
 expect(JSON.stringify(result)).not.toMatch(/PRIVATE|referer|meta|https:/);
});
