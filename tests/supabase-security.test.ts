import { afterEach, beforeEach, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { testDb } from './helpers/db';
let fixture:Awaited<ReturnType<typeof testDb>>;
beforeEach(async()=>{fixture=await testDb();});afterEach(async()=>fixture?.close());
it('denies browser database roles and hides private records even if SELECT is accidentally granted',async()=>{
 const db=fixture.db;
 for(const sql of ['CREATE ROLE anon','CREATE ROLE authenticated','CREATE TABLE schema_migrations(name text PRIMARY KEY)'])await db.query(sql);
 for(const sql of (await readFile('supabase/security.sql','utf8')).split(';').filter(sql=>sql.trim()))await db.query(sql);
 await db.query("INSERT INTO wordpress_records(id,source,kind,source_id,payload,checksum,captured_at) VALUES($1,'test','user','1','{}',$2,now())",[randomUUID(),'a'.repeat(64)]);
 await db.query('SET ROLE anon');
 await expect(db.query('SELECT * FROM wordpress_records')).rejects.toThrow(/permission denied/i);
 await db.query('RESET ROLE');
 await db.query('GRANT SELECT ON wordpress_records TO authenticated');
 await db.query('SET ROLE authenticated');
 expect((await db.query('SELECT * FROM wordpress_records')).rows).toEqual([]);
 await db.query('RESET ROLE');
});
