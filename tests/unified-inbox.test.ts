import {afterAll,beforeAll,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {testDb} from './helpers/db';
import {adminList} from '../src/server/admin';
import {fingerprint} from '../src/server/wordpress-migration';
import {historicalEntry} from '../src/server/wordpress-projection';
import {referenceForms} from '../src/domain/wordpress-forms';
import type {Actor} from '../src/server/core';
let f:Awaited<ReturnType<typeof testDb>>,owner:Actor,shared:string,school:string,before:any[];
beforeAll(async()=>{
 f=await testDb();owner={id:randomUUID(),role:'owner'};shared=randomUUID();school=randomUUID();
 await f.db.query("INSERT INTO users(id,role,contact) VALUES($1,'owner','unified@local.test')",[owner.id]);
 await f.db.query("INSERT INTO schools(id,reference,name,address,city,state,postal_code,status) VALUES($1,'SCH-UNIFIED','Green School','Road','Delhi','Delhi','','active')",[school]);
 await f.db.query("INSERT INTO portal_form_records(id,form_key,reference,status,school_id,answers,submitted_at) VALUES($1,'student','YES-UNIFIED','submitted',$2,$3,'2026-11-14T04:00:00Z')",[shared,school,JSON.stringify({'text-1':'Modern Student','password-1':'NEVER EXPOSE'})]);
 await f.db.query("INSERT INTO portal_form_records(id,form_key,reference,status,answers) VALUES($1,'student','PRIVATE-DRAFT','draft',$2)",[randomUUID(),JSON.stringify({'text-1':'PRIVATE DRAFT'})]);
 for(const [id,sourceId,formId,date,name] of [[shared,'111',48441,'2026-11-15 08:00:00','Earlier Student'],[randomUUID(),'112',28713,'2026-11-13 08:00:00','Legacy Student'],[randomUUID(),'113',999999,null,'Unknown Form']] as const){
  const payload={form_id:formId,status:'active',date_created:date,meta:[{meta_key:'text-1',meta_value:name},{meta_key:'registered-school-id',meta_value:'SCH-UNIFIED'},{meta_key:'password-1',meta_value:'NEVER EXPOSE'}]};
  await f.db.query("INSERT INTO wordpress_records(id,source,kind,source_id,payload,checksum,captured_at) VALUES($1,'https://source.local','entry',$2,$3,$4,now())",[id,sourceId,JSON.stringify(payload),fingerprint(payload)]);
 }
 before=(await f.db.query('SELECT * FROM wordpress_records ORDER BY id')).rows;
});
afterAll(async()=>f?.close());
const list=(params:Record<string,string>={})=>adminList(f.db,owner,'submission-inbox',new URLSearchParams(params));
it('combines before pagination, retains both namespaces with colliding IDs and uses original dates',async()=>{
 const a=await list({pageSize:'2'}),b=await list({pageSize:'2',page:'2'});
 expect(a.total).toBe(4);expect(a.items.map((r:any)=>r.reference)).toEqual(['WP-111','YES-UNIFIED']);
 expect(new Set([...a.items,...b.items].map(r=>r.key)).size).toBe(4);
 expect(a.items[0].submitted_at).toBe('2026-11-15 08:00:00');expect(b.items[1].submitted_at).toBeNull();
 expect(a.items[0].href).toBe('/history/'+shared);expect(a.items[1].href).toBe('/forms/student#saved='+shared);
 expect(JSON.stringify([...a.items,...b.items])).not.toMatch(/NEVER EXPOSE|PRIVATE DRAFT|password|sourceChecksum|answers|ownerIdentity|storage_key/);
});
it('searches all records and groups known registration aliases before form filtering',async()=>{
 expect((await list({q:'student',formKey:'student'})).total).toBe(3);
 expect((await list({q:'Earlier Student'})).total).toBe(1);
 const schools=await list({schoolId:school});expect(schools.total).toBe(4);
 expect((await list({formKey:'student'})).formTotals).toMatchObject({student:3});
 expect((await list({q:'Unknown Form'})).items[0].title).toBe('Other form');
 expect((await list({id:shared})).total).toBe(2);
});
it('retains authorization, rejects inactive staff and leaves every original row unchanged',async()=>{
 for(const role of ['participant','judge'] as const)await expect(adminList(f.db,{...owner,role},'submission-inbox',new URLSearchParams())).rejects.toMatchObject({status:403});
 await f.db.query('UPDATE users SET active=false WHERE id=$1',[owner.id]);
 await expect(list()).rejects.toMatchObject({status:401});await f.db.query('UPDATE users SET active=true WHERE id=$1',[owner.id]);
 await list();expect((await f.db.query('SELECT * FROM wordpress_records ORDER BY id')).rows).toEqual(before);
});
it('keeps supplemental original dates, safe names and detail fields without leaking logs or arbitrary values',async()=>{
 const id=randomUUID(),payload={source_table:'wp_e_submissions',row:{created_at:'2024-12-10 09:45:00',form_name:'Summit enquiry',post_id:'25',element_id:'abc123',status:'new',user_ip:'PRIVATE IP'},values:[{key:'fname',value:'Supplemental'},{key:'lanme',value:'Participant'},{key:'email',value:'qa@local.test'},{key:'field_65f0b6c',value:'PRIVATE OPAQUE'},{key:'password',value:'PRIVATE PASSWORD'}],actions_log:[{data:'PRIVATE LOG'}]};
 await f.db.query("INSERT INTO wordpress_records(id,source,kind,source_id,payload,checksum,captured_at) VALUES($1,'https://source.local','entry','elementor:777',$2,$3,now())",[id,JSON.stringify(payload),fingerprint(payload)]);
 const result=await list({q:'Supplemental Participant'});expect(result.total).toBe(1);expect(result.items[0]).toMatchObject({id,title:'Summit enquiry',submitted_at:'2024-12-10 09:45:00',status:'submitted'});
 const detail=await historicalEntry(f.db,owner,id);expect(detail.createdAt).toBe('2024-12-10 09:45:00');expect(detail.fields.some(field=>field.label==='First name')).toBe(true);
 expect(JSON.stringify([result,detail])).not.toMatch(/PRIVATE|actions_log|user_ip/);
 expect((await f.db.query('SELECT payload,checksum FROM wordpress_records WHERE id=$1',[id])).rows[0]).toEqual({payload,checksum:fingerprint(payload)});
});
it('uses the original form field labels for school text instead of mistaking educator state for school',async()=>{
 const id=randomUUID(),form=referenceForms.find(f=>f.key==='teacher')!,payload={form_id:form.id,status:'active',date_created:'2026-11-15 08:00:00',meta:[{meta_key:'name-1',meta_value:'QA Teacher'},{meta_key:'select-2',meta_value:'Haryana'},{meta_key:'select-3',meta_value:'QA Correct School'}]};
 await f.db.query("INSERT INTO wordpress_records(id,source,kind,source_id,payload,checksum,captured_at) VALUES($1,'https://source.local','entry','teacher-school-test',$2,$3,now())",[id,JSON.stringify(payload),fingerprint(payload)]);
 expect((await list({id})).items[0]).toMatchObject({school_name:'QA Correct School',school_id:null});
 const condition=form.fields.find(field=>field.id==='text-10')!.conditions![0];
 payload.meta[2].meta_value=String(condition.value);payload.meta.push({meta_key:'text-10',meta_value:'QA Custom School'});
 await f.db.query('UPDATE wordpress_records SET payload=$2,checksum=$3 WHERE id=$1',[id,JSON.stringify(payload),fingerprint(payload)]);
 expect((await list({id})).items[0]).toMatchObject({school_name:'QA Custom School',school_id:null});
});
