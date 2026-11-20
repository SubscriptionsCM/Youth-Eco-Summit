import {beforeAll,afterAll,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {testDb} from './helpers/db';
import {referenceForms} from '../src/domain/wordpress-forms';
import {fingerprint} from '../src/server/wordpress-migration';
import {createJudgingRound,assignJudgingEntries,listJudgingEntries} from '../src/server/judge-portal';
import type {Actor} from '../src/server/core';
let f:Awaited<ReturnType<typeof testDb>>,owner:Actor,shared:string,round:any,before:any[];
beforeAll(async()=>{
 f=await testDb();owner={id:randomUUID(),role:'owner'};shared=randomUUID();const form=referenceForms.find(f=>f.key==='open-letter')!;
 await f.db.query("INSERT INTO users(id,role,contact) VALUES($1,'owner','mixed-judge@local.test')",[owner.id]);
 await f.db.query("INSERT INTO portal_form_records(id,form_key,reference,status,answers,form_snapshot,submitted_at) VALUES($1,'open-letter','YES-MIXED','submitted',$2,$3,'2026-11-14T06:00:00Z')",[shared,JSON.stringify({'select-yes-class':'8'}),JSON.stringify(form)]);
 await f.db.query("INSERT INTO portal_form_files(id,record_id,field_id,filename,storage_key,expected_size,expected_checksum,mime_type,status,verified_at) VALUES($1,$2,'upload-yes-1','test.pdf','private/mixed-test',20,$3,'application/pdf','ready',now())",[randomUUID(),shared,'a'.repeat(64)]);
 const payload={form_id:form.id,status:'active',date_created:'2026-11-15 08:00:00',meta:[{meta_key:'select-yes-class',meta_value:'8'},{meta_id:101,meta_key:'upload-yes-1',meta_value:'retained-file'}]};
 await f.db.query("INSERT INTO wordpress_records(id,source,kind,source_id,payload,checksum,captured_at) VALUES($1,'https://mixed.local','entry','444',$2,$3,now())",[shared,JSON.stringify(payload),fingerprint(payload)]);
 await f.db.query("INSERT INTO wordpress_attachments(id,source,source_id,entry_record_id,filename,mime_type,byte_size,checksum,storage_key,verified_at) VALUES($1,'https://mixed.local',$2,$3,'test.pdf','application/pdf',20,$4,'wordpress/mixed/test',now())",[randomUUID(),'101:'+'f'.repeat(64),shared,'b'.repeat(64)]);
 round=await createJudgingRound(f.db,owner,{formKey:'open-letter',edition:'2027',name:'Mixed round',open:false});
 before=(await f.db.query('SELECT * FROM wordpress_records ORDER BY id')).rows;
});
afterAll(async()=>f?.close());
it('lists both origins together by original date without merging matching UUIDs',async()=>{
 const result=await listJudgingEntries(f.db,owner,new URLSearchParams({source:'all',formKey:'open-letter'}));
 expect(result.total).toBe(2);expect(result.items.map(i=>i.source)).toEqual(['wordpress','portal']);expect(result.items.map(i=>i.id)).toEqual([shared,shared]);
 expect(result.items[0].submitted_at).toBe('2026-11-15 08:00:00');expect(JSON.stringify(result)).not.toMatch(/answers|storage_key|checksum|filename/);
});
it('assigns mixed selections atomically, rolls back any invalid selection and safely retries',async()=>{
 const common={roundId:round.id,judgeId:owner.id,reason:'Isolated mixed assignment test'};
 await expect(assignJudgingEntries(f.db,owner,{...common,entries:[{source:'portal',id:shared},{source:'wordpress',id:randomUUID()}]})).rejects.toMatchObject({status:422});
 expect((await f.db.query('SELECT count(*)::int n FROM judging_assignments')).rows[0].n).toBe(0);
 const entries=[{source:'portal',id:shared},{source:'wordpress',id:shared}];
 const first=await assignJudgingEntries(f.db,owner,{...common,entries}),retry=await assignJudgingEntries(f.db,owner,{...common,entries:[...entries,entries[0]]});
 expect(first.items).toHaveLength(2);expect(retry.items).toEqual(first.items);
 expect((await f.db.query('SELECT * FROM wordpress_records ORDER BY id')).rows).toEqual(before);
});
