import { describe, expect, it } from 'vitest';
import { testDb } from './helpers/db';
import { archiveWordPress, fingerprint } from '../src/server/wordpress-migration';
import { archiveWordPressVersions } from '../scripts/lib/wordpress-versions';

const envelope=(email:string)=>({format:'yes-wordpress-export/v1',source:'https://youthecosummit.com',capturedAt:'2026-11-11T03:47:55Z',counts:{records:1,attachments:0},records:[{kind:'user',sourceId:'1',payload:{user_email:email,meta:[{key:'example',value:'原文'}]}}],attachments:[]});
describe('immutable subsequent WordPress snapshots',()=>{
 it('retains changed payloads separately, defaults to preview, and safely retries',async()=>{
  const fixture=await testDb();try{
   const original=envelope('old@example.org'),current=envelope('new@example.org');
   await archiveWordPress(fixture.db,original,{commit:true});
   expect(await archiveWordPressVersions(fixture.db,current)).toMatchObject({ready:1,inserted:0});
   expect((await fixture.db.query('SELECT * FROM wordpress_record_versions')).rows).toHaveLength(0);
   expect(await archiveWordPressVersions(fixture.db,current,{commit:true})).toMatchObject({inserted:1});
   expect(await archiveWordPressVersions(fixture.db,current,{commit:true})).toMatchObject({inserted:0,unchanged:1});
   expect((await fixture.db.query('SELECT payload FROM wordpress_records')).rows[0].payload).toEqual(original.records[0].payload);
   const versions=(await fixture.db.query('SELECT * FROM wordpress_record_versions')).rows;
   expect(versions[0].payload).toEqual(current.records[0].payload);expect(versions[0].checksum).toBe(fingerprint(current.records[0].payload));
   await expect(fixture.db.query("UPDATE wordpress_record_versions SET payload='{}'")).rejects.toThrow(/immutable/i);
   await expect(fixture.db.query('DELETE FROM wordpress_record_versions')).rejects.toThrow(/immutable/i);
   expect((await fixture.db.query('SELECT * FROM users')).rows).toHaveLength(0);
  }finally{await fixture.close();}
 });
 it('rejects a missing parent or corrupted baseline before writing any snapshot',async()=>{
  const fixture=await testDb();try{
   const current=envelope('new@example.org');
   await expect(archiveWordPressVersions(fixture.db,current,{commit:true})).rejects.toThrow(/original/i);
   await archiveWordPress(fixture.db,envelope('old@example.org'),{commit:true});
   await fixture.db.query("UPDATE wordpress_records SET checksum=$1",['0'.repeat(64)]);
   await expect(archiveWordPressVersions(fixture.db,current,{commit:true})).rejects.toThrow(/checksum/i);
   expect((await fixture.db.query('SELECT * FROM wordpress_record_versions')).rows).toHaveLength(0);
  }finally{await fixture.close();}
 });
});
