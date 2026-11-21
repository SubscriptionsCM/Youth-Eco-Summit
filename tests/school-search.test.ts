import {afterAll,beforeAll,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {testDb} from './helpers/db';
import {publicSchools} from '../src/server/registration';

let fixture:Awaited<ReturnType<typeof testDb>>;
const sj=randomUUID(),hr=randomUUID(),hrOther=randomUUID(),bak=randomUUID(),hindi=randomUUID(),hindiOther=randomUUID();
const hrName='H.R. Patel Kanya Secondary And Higher Secondary School ShirpurDist.Dhule Maharashtra';
async function school(id:string,reference:string,name:string,city='',state='',status='active'){
 await fixture.db.query('INSERT INTO schools(id,reference,name,address,city,state,postal_code,status) VALUES($1,$2,$3,$4,$5,$6,\'\',$7)',[id,reference,name,id,city,state,status]);
}
const search=(q:string,city='',page=1)=>publicSchools(fixture.db,new URLSearchParams({q,city,page:String(page)}));
beforeAll(async()=>{
 fixture=await testDb();
 await school(sj,'YES-SCH-BEFC5CCDB8','S. J. Public SCHOOL');
 await school(hr,'YES-SCH-0196F5E3',hrName,'Shirpur','Maharashtra');
 await school(hrOther,'YES-SCH-5609DF27D2','H.R. Patel Kanya Secondary And Higher Secondary School, Shirpur Dist.Dhule');
 await school(bak,'YES-SCH-81E1C2A7','Shree B.A.K Swadhyay Bhavan','Mumbai','Maharashtra');
 await school(hindi,'HINDI-ONE','श्री संत ज्ञानेश्वर विद्यालय');
 await school(hindiOther,'HINDI-TWO','शरी संत ज्ञानेश्वर विद्यालय');
 await fixture.db.query("INSERT INTO school_identifiers(reference,school_id,kind) VALUES('YES-SCH-258E2D57BF',$1,'imported'),('YEC-EDU-0196F5E3',$2,'imported'),('YES-SCH-EB7B157067',$3,'imported')",[sj,hr,bak]);
 for(const [index,status] of ['pending','inactive','active','active'].entries()){
  const id=randomUUID();await school(id,`EXCLUDED-${index}`,'S.J. Public School','','',status);
  if(index===2)await fixture.db.query('UPDATE schools SET trashed_at=now() WHERE id=$1',[id]);
  if(index===3)await fixture.db.query('UPDATE schools SET purging=true WHERE id=$1',[id]);
 }
 for(let i=1;i<=27;i++)await school(randomUUID(),`PAGE-${String(i).padStart(2,'0')}`,`Pagination Public School ${String(i).padStart(2,'0')}`);
 await fixture.db.query("INSERT INTO school_contacts(id,school_id,name,role,email,phone) VALUES($1,$2,'Private coordinator','Teacher','private@example.test','+919999000999')",[randomUUID(),sj]);
});
afterAll(async()=>fixture?.close());

it.each(['S.J.PublicSchool','S.J. Public School','S J Public School','SJ Public School','s.  j. public school','S.\tJ.\u00a0Public\u2003School'])('finds the eligible S.J. school for punctuation/spacing variant %s',async query=>{
 const result=await search(query);expect(result.total).toBe(1);expect(result.items).toMatchObject([{id:sj,reference:'YES-SCH-BEFC5CCDB8',alternate_references:['YES-SCH-258E2D57BF']}]);
});
it('finds the reported H.R. Patel spelling without merging similar school records',async()=>{
 for(const query of ['H.R. Patel','H. R. Patel','HR Patel','H R Patel']){
  const result=await search(query);expect(result.total).toBe(2);expect(new Set(result.items.map(item=>item.id))).toEqual(new Set([hr,hrOther]));
 }
 const result=await search('H R Patel Kanya Secondary And Higher Secondary School Shirpur Dist Dhule Maharashtra');
 expect(result.items).toMatchObject([{id:hr,reference:'YES-SCH-0196F5E3',name:hrName,city:'Shirpur',state:'Maharashtra'}]);
});
it('keeps canonical and alias ID searches case insensitive without inventing punctuation-free IDs',async()=>{
 for(const query of ['YES-SCH-0196F5E3','yes-sch-0196f5e3','YEC-EDU-0196F5E3','yec-edu-0196f5e3'])expect((await search(query)).items).toMatchObject([{id:hr,reference:'YES-SCH-0196F5E3'}]);
 expect((await search('YES-SCH-258E2D57BF')).items).toMatchObject([{id:sj,reference:'YES-SCH-BEFC5CCDB8'}]);
 expect((await search('YESSCH0196F5E3')).total).toBe(0);
});
it('preserves the reported competition school ID as an alias of its existing canonical school',async()=>{
 for(const query of ['YES-SCH-EB7B157067','yes-sch-eb7b157067','YES-SCH-81E1C2A7'])expect((await search(query)).items).toMatchObject([{id:bak,reference:'YES-SCH-81E1C2A7',name:'Shree B.A.K Swadhyay Bhavan'}]);
});
it('ignores Hindi separators while preserving vowel marks and conjuncts',async()=>{
 expect((await search('श्री. संत  ज्ञानेश्वरविद्यालय')).items).toMatchObject([{id:hindi}]);
 expect((await search('शरी संत ज्ञानेश्वर विद्यालय')).items).toMatchObject([{id:hindiOther}]);
});
it('returns no schools for a separator-only query while preserving empty directory browsing',async()=>{
 for(const query of ['...','--','%','_','“”','।॥',' . , / \t'])expect(await search(query)).toMatchObject({items:[],total:0,page:1,pageSize:25});
 expect((await search('')).total).toBe(33);expect((await search('   ')).total).toBe(33);
});
it('preserves city/state restrictions and leaves unknown location fields unchanged',async()=>{
 expect((await search('HR Patel','Shirpur')).items).toMatchObject([{id:hr}]);
 expect((await search('HR Patel','Maharashtra')).items).toMatchObject([{id:hr}]);
 expect((await search('YES-SCH-BEFC5CCDB8','Jaipur')).total).toBe(0);
 expect((await search('SJPublicSchool')).items).toMatchObject([{id:sj,city:'',state:''}]);
});
it('preserves pagination and public-only data after normalized name matching',async()=>{
 const first=await search('Pagination.PublicSchool'),second=await search('Pagination.PublicSchool','',2);
 expect(first).toMatchObject({total:27,page:1,pageSize:25});expect(first.items).toHaveLength(25);
 expect(second).toMatchObject({total:27,page:2,pageSize:25});expect(second.items).toHaveLength(2);
 expect(new Set([...first.items,...second.items].map(item=>item.id)).size).toBe(27);
 const result=await search('SJPublicSchool');expect(JSON.stringify(result)).not.toMatch(/private@example|Private coordinator|9999000999|contacts/);
});
