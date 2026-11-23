import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import ExcelJS from 'exceljs';
import {randomUUID} from 'node:crypto';
import {testDb} from './helpers/db';
import {exportData} from '../src/server/exports';
import {fingerprint} from '../src/server/wordpress-migration';
import {referenceForms} from '../src/domain/wordpress-forms';
import {type Actor} from '../src/server/core';
import {db} from '../src/server/db';
import * as auth from '../src/server/auth';
import {handleRequest} from '../src/server/router';
let fixture:Awaited<ReturnType<typeof testDb>>,admin:Actor,schoolId:string;
const params=()=>new URLSearchParams({resource:'registrations',format:'xlsx'});
beforeAll(async()=>{
 fixture=await testDb();admin={id:randomUUID(),role:'admin',contact:'export-admin@example.test'};schoolId=randomUUID();
 await fixture.db.query('INSERT INTO users(id,role,contact) VALUES($1,$2,$3)',[admin.id,admin.role,admin.contact]);
 await fixture.db.query("INSERT INTO schools(id,reference,name,address,city,state,postal_code,status) VALUES($1,'YES-SCH-EXPORT','Export school','Street','Delhi','Delhi','001234','active')",[schoolId]);
 await fixture.db.query("INSERT INTO school_contacts(id,school_id,name,role,email,phone) VALUES($1,$2,'School contact','Educator','school@example.test','+919000000001')",[randomUUID(),schoolId]);
 for(const [key,status,reference] of [['student','submitted','STUDENT-ONE'],['teacher','submitted','EDUCATOR-ONE'],['school','submitted','SCHOOL-ONE'],['student','draft','UNFINISHED'],['digital-art','submitted','COMPETITION']] as const){
  const answers={'name-1':{'first-name':'Student','last-name':'One'},'name-2':'School rep','name-3':'Educator','email-1':'registered@example.test','phone-1':'+919000000002','phone-4':'00919876543210','text-1':'=HYPERLINK("https://example.test","Test")','password-1':'NEVER-EXPORT-THIS','hidden-token':'PRIVATE-TOKEN','registered-school-id':'YES-SCH-EXPORT'};
  await fixture.db.query('INSERT INTO portal_form_records(id,form_key,reference,status,answers,school_id,submitted_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),key,reference,status,JSON.stringify(answers),schoolId,status==='submitted'?'2026-11-23T07:30:00Z':null]);
 }
 const form=referenceForms.find(f=>f.key==='legacy-48413')!;
 for(const [sourceId,draft] of [['export-legacy','0'],['export-draft','1']]){
  const payload={form_id:form.id,status:'active',is_draft:draft,date_created:'2025-11-05 13:30:00',meta:[{meta_key:'name-1',meta_value:'Original student'},{meta_key:'email-1',meta_value:'original@example.test'},{meta_key:'registered-school-id',meta_value:'YES-SCH-EXPORT'}]};
  await fixture.db.query("INSERT INTO wordpress_records(id,source,kind,source_id,payload,checksum,captured_at) VALUES($1,'https://archive.example.test','entry',$2,$3,$4,now())",[randomUUID(),sourceId,JSON.stringify(payload),fingerprint(payload)]);
 }
});
afterAll(async()=>{vi.restoreAllMocks();await fixture?.close();});
it('exports all completed registration kinds and historical records, with a separate school directory',async()=>{
 const response=await exportData(fixture.db,admin,params());expect(response.status).toBe(200);
 expect(response.headers.get('Content-Type')).toContain('spreadsheetml.sheet');expect(response.headers.get('Content-Disposition')).toMatch(/attachment; filename="Youth-Eco-Summit-registrations-\d{4}-\d{2}-\d{2}\.xlsx"/);
 expect(response.headers.get('Cache-Control')).toContain('no-store');
 const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(await response.arrayBuffer()) as any);
 expect(book.worksheets.map(s=>s.name)).toEqual(['Overview','Students','Educators','School registrations','School directory']);
 const students=book.getWorksheet('Students')!;
 expect(students.rowCount).toBe(7);expect(book.getWorksheet('Educators')!.rowCount).toBe(6);expect(book.getWorksheet('School registrations')!.rowCount).toBe(6);
 expect(students.getCell('A6').value).toBe('STUDENT-ONE');expect(students.getCell('B6').text).toBe('2026-11-23 13:00:00');expect(students.getCell('B7').text).toBe('2025-11-05 13:30:00');
 expect(book.getWorksheet('Educators')!.getCell('H6').value).toBe('00919876543210');expect(book.getWorksheet('School directory')!.getCell('G6').value).toBe('001234');
 expect(students.views[0]).toMatchObject({state:'frozen',ySplit:5});expect(students.autoFilter).toBeTruthy();
 const values=JSON.stringify(book.model);expect(values).not.toContain('NEVER-EXPORT-THIS');expect(values).not.toContain('PRIVATE-TOKEN');expect(values).not.toContain('UNFINISHED');expect(values).not.toContain('COMPETITION');
 const injected=students.getRow(6).values as ExcelJS.CellValue[];const position=injected.findIndex(v=>typeof v==='string'&&v.startsWith('=HYPERLINK'));
 expect(position).toBeGreaterThan(0);expect(students.getCell(6,position).type).toBe(ExcelJS.ValueType.String);
 expect(book.getWorksheet('Overview')!.getCell('B9').value).toMatchObject({formula:'SUM(B6:B8)',result:4});
 const audit=(await fixture.db.query("SELECT detail FROM audit_events WHERE action='export.download' ORDER BY created_at DESC LIMIT 1")).rows[0].detail;
 expect(audit).toMatchObject({resource:'registrations',format:'xlsx',completedRegistrations:4,excludedIncomplete:2,schoolDirectory:1});
});
it('rejects participants, judges, deactivated staff and stale role claims',async()=>{
 for(const role of ['participant','judge'] as const)await expect(exportData(fixture.db,{...admin,role},params())).rejects.toMatchObject({status:403});
 await fixture.db.query('UPDATE users SET active=false WHERE id=$1',[admin.id]);
 await expect(exportData(fixture.db,admin,params())).rejects.toMatchObject({status:401});
 await fixture.db.query("UPDATE users SET active=true,role='participant' WHERE id=$1",[admin.id]);
 await expect(exportData(fixture.db,admin,params())).rejects.toMatchObject({status:401});
 await fixture.db.query("UPDATE users SET role='admin' WHERE id=$1",[admin.id]);
});
it('requires sign-in at the actual export route and returns the Excel attachment for active admins',async()=>{
 vi.spyOn(auth,'getActor').mockResolvedValue(null);vi.spyOn(db,'query').mockImplementation((sql,args)=>fixture.db.query(sql,args));vi.spyOn(db,'transaction').mockImplementation(fn=>fixture.db.transaction(fn));
 const call=()=>handleRequest(new Request('https://yes.test/api/admin/exports?'+params()),['admin','exports']);
 expect((await call()).status).toBe(401);vi.mocked(auth.getActor).mockResolvedValue({...admin,role:'judge'});expect((await call()).status).toBe(403);
 vi.mocked(auth.getActor).mockResolvedValue(admin);expect((await call()).headers.get('Content-Disposition')).toContain('.xlsx');vi.restoreAllMocks();
});
it('does not silently accept filters for a workbook labelled all registrations',async()=>{
 await expect(exportData(fixture.db,admin,new URLSearchParams({resource:'registrations',format:'xlsx',q:'only-one'}))).rejects.toMatchObject({status:422});
});
it('preserves manually entered school names when Other is selected',async()=>{
 const recordId=randomUUID();
 await fixture.db.query("INSERT INTO portal_form_records(id,form_key,reference,status,answers,submitted_at) VALUES($1,'school','MANUAL-SCHOOL','submitted',$2,now())",[recordId,JSON.stringify({'select-1':'Others','text-1':'Manually entered school'})]);
 try{
  const response=await exportData(fixture.db,admin,params()),book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(await response.arrayBuffer()) as any);
  const sheet=book.getWorksheet('School registrations')!;let found=false;
  sheet.eachRow(row=>{if(row.getCell(1).value==='MANUAL-SCHOOL'){found=true;expect(row.getCell(5).value).toBe('Manually entered school');}});expect(found).toBe(true);
 }finally{await fixture.db.query('DELETE FROM portal_form_records WHERE id=$1',[recordId]);}
});
it('includes records beyond an inbox page and rechecks permissions before returning the file',async()=>{
 const added=Array.from({length:31},()=>randomUUID());
 try{
  for(const recordId of added)await fixture.db.query("INSERT INTO portal_form_records(id,form_key,reference,status,answers,submitted_at) VALUES($1,'student',$2,'submitted','{}',now())",[recordId,'PAGE-'+recordId]);
  const response=await exportData(fixture.db,admin,params()),book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(await response.arrayBuffer()) as any);
  expect(book.getWorksheet('Students')!.rowCount).toBe(38);expect(book.getWorksheet('Overview')!.getCell('B9').value).toMatchObject({result:35});
  const before=(await fixture.db.query('SELECT count(*)::int n FROM audit_events')).rows[0].n;
  let transactions=0;
  const revoked={...fixture.db,transaction:async<T>(fn:Parameters<typeof fixture.db.transaction<T>>[0])=>{
   const result=await fixture.db.transaction(fn);
   if(++transactions===1)await fixture.db.query('UPDATE users SET active=false WHERE id=$1',[admin.id]);
   return result;
  }};
  await expect(exportData(revoked,admin,params())).rejects.toMatchObject({status:401});
  expect((await fixture.db.query('SELECT count(*)::int n FROM audit_events')).rows[0].n).toBe(before);
 }finally{await fixture.db.query('UPDATE users SET active=true WHERE id=$1',[admin.id]);await fixture.db.query('DELETE FROM portal_form_records WHERE id=ANY($1::uuid[])',[added]);}
});
it('allows an owner to download an empty workbook with all headers and zero totals',async()=>{
 const empty=await testDb(),owner={...admin,role:'owner' as const};
 try{
  await empty.db.query("INSERT INTO users(id,role,contact) VALUES($1,'owner',$2)",[owner.id,owner.contact]);
  const response=await exportData(empty.db,owner,params()),book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(await response.arrayBuffer()) as any);
  expect(book.worksheets).toHaveLength(5);expect(book.getWorksheet('Students')!.getCell('A5').value).toBe('Registration reference');
  expect(book.getWorksheet('Overview')!.getCell('B9').formula).toBe('SUM(B6:B8)');
  expect(book.getWorksheet('Overview')!.getCell('B9').result).toBe(0);
 }finally{await empty.close();}
});
