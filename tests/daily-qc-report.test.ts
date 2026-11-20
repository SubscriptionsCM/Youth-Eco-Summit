import {beforeAll,afterAll,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {testDb} from './helpers/db';
import {submissionReport,saveQuality} from '../src/server/submission-quality';
let f:Awaited<ReturnType<typeof testDb>>,owner:{id:string;role:'owner'},entry:string;
const now=new Date('2026-11-20T12:00:00Z');
const report=(day:string)=>submissionReport(f.db,owner,new URLSearchParams({reportDate:day}),now);
beforeAll(async()=>{
 f=await testDb();owner={id:randomUUID(),role:'owner'};entry=randomUUID();
 await f.db.query("INSERT INTO users(id,role,contact) VALUES($1,'owner','daily-owner@test.example')",[owner.id]);
 for(const [form,date] of [['student','2026-11-17T02:00:00Z'],['teacher','2026-11-17T02:00:00Z'],['school','2026-11-17T02:00:00Z'],['student','2026-11-18T02:00:00Z'],['open-letter','2026-11-17T02:00:00Z'],['open-letter','2026-11-17T19:00:00Z']]){
  const id=form==='open-letter'&&date==='2026-11-17T02:00:00Z'?entry:randomUUID();
  await f.db.query("INSERT INTO portal_form_records(id,form_key,reference,status,answers,submitted_at) VALUES($1,$2,$3,'submitted','{}',$4)",[id,form,'DAILY-'+id,date]);
 }
});
afterAll(async()=>f?.close());
it('counts all three submitted registration types and uses the original India submission day',async()=>{
 const r=await report('2026-11-17');expect(r.summary).toMatchObject({totalRegistrations:3,submissions:1,qcCompleted:0,qcRemaining:1});
 expect((await report('2026-11-18')).summary).toMatchObject({totalRegistrations:4,submissions:2});
 expect(r.scope.reportDate).toBe('2026-11-17');
});
it('rejects impossible and future report dates',async()=>{
 for(const day of ['2026-02-29','2026-13-01','2026-11-21','yesterday'])await expect(report(day)).rejects.toMatchObject({status:422});
});
it('reconstructs historical completed QC after reopening and preserves completion dates on note edits',async()=>{
 const update=async(status:string,date:string)=>{
  const shown=(await submissionReport(f.db,owner,new URLSearchParams(),now)).items.find(r=>r.id===entry)!;
  return saveQuality(f.db,owner,{source:'portal',recordId:entry,status,note:'Synthetic QA',reason:'Isolated fixture',lockVersion:shown.qcVersion,sourceVersion:shown.sourceVersion},new Date(date));
 };
 const originals=(await f.db.query('SELECT * FROM portal_form_records ORDER BY id')).rows;
 await update('completed','2026-11-17T18:29:59Z');
 await update('completed','2026-11-18T04:00:00Z');
 await update('pending','2026-11-19T04:00:00Z');
 expect((await report('2026-11-17')).summary).toMatchObject({qcCompleted:1,qcCompletedToday:1,qcRemaining:0});
 expect((await report('2026-11-18')).summary).toMatchObject({qcCompleted:1,qcCompletedToday:0,qcRemaining:1});
 expect((await report('2026-11-19')).summary).toMatchObject({qcCompleted:0,qcCompletedToday:0,qcRemaining:2});
 expect((await f.db.query('SELECT * FROM portal_form_records ORDER BY id')).rows).toEqual(originals);
});
it('rejects participant access to dated reports',async()=>{
 await expect(submissionReport(f.db,{id:randomUUID(),role:'participant'},new URLSearchParams({reportDate:'2026-11-17'}),now)).rejects.toMatchObject({status:403});
});
it('reconciles every category with the overall totals and excludes draft registrations',async()=>{
 const id=randomUUID();await f.db.query("INSERT INTO portal_form_records(id,form_key,reference,status,answers,submitted_at) VALUES($1,'student','DAILY-DRAFT','draft','{}','2026-11-17T02:00:00Z')",[id]);
 const r=await report('2026-11-20');expect(r.summary.totalRegistrations).toBe(4);
 for(const [category,overall] of [['submissions','submissions'],['completed','qcCompleted'],['remaining','qcRemaining'],['today','qcCompletedToday']] as const)expect(r.categories.reduce((n,c)=>n+c[category],0)).toBe(r.summary[overall]);
 expect(r.summary.qcCompleted+r.summary.qcRemaining).toBe(r.summary.submissions);
});
it('uses audited category responsibility as of the selected day',async()=>{
 await f.db.query("INSERT INTO submission_category_coordinators(form_key,coordinator,updated_by,updated_at) VALUES('open-letter','Later coordinator',$1,'2026-11-19T04:00:00Z')",[owner.id]);
 for(const [day,before,after] of [['17','','First coordinator'],['19','First coordinator','Later coordinator']])await f.db.query("INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,detail,created_at) VALUES($1,$2,'submission.coordinator.update','submission_category_coordinators','open-letter',$3,$4)",[randomUUID(),owner.id,JSON.stringify({before,after}),`2026-11-${day}T04:00:00Z`]);
 expect((await report('2026-11-16')).categories[0].coordinator).toBe('');
 expect((await report('2026-11-17')).categories[0].coordinator).toBe('First coordinator');
 expect((await report('2026-11-20')).categories[0].coordinator).toBe('Later coordinator');
});
