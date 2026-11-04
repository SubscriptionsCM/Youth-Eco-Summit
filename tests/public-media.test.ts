import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { id } from '../src/server/core';
import { db as liveDb } from '../src/server/db';
import { publicMedia, showcaseList } from '../src/server/public-media';
import { publish } from '../src/server/publication';
import * as provider from '../src/server/storage/provider';
import { parseRange } from '../src/server/storage/validation';

describe('explicitly approved public media', () => {
  let fixture: Awaited<ReturnType<typeof import('./helpers/db').testDb>>;
  const owner=id(), edition=id(), competition=id(), entry=id(), otherEntry=id(), publication=id(), asset=id(), otherAsset=id();
  const schools=[id(),id()], students=[id(),id()], participations=[id(),id()], consentIds=[id(),id()];
  const bytes=Buffer.from('approved public video bytes'); let reads=0;
  const request=(method='GET',range?:string) => new Request(`https://summit.test/api/public/showcase/${publication}/media/${asset}`,{method,headers:range?{Range:range}:{}});
  beforeAll(async () => {
    const {testDb}=await import('./helpers/db'); fixture=await testDb();
    vi.spyOn(liveDb,'query').mockImplementation((sql,params)=>fixture.db.query(sql,params));
    vi.spyOn(provider,'objectStore').mockReturnValue({async read(key:string,version?:string,etag?:string,range?:string){
      reads++;expect(key).toBe(`submissions/${entry}/${asset}`);expect(version).toBe('approved-version');expect(etag).toBe('approved-etag');
      const bounds=range?parseRange(range,bytes.length):{start:0,end:bytes.length-1};
      async function* stream(){yield bytes.subarray(bounds.start,bounds.end+1);}return {Body:stream()};
    }} as unknown as provider.S3Store);
    await fixture.db.query("INSERT INTO users(id,role,contact) VALUES($1,'owner','public-test-owner')",[owner]);
    await fixture.db.query("INSERT INTO editions(id,label,state) VALUES($1,'Public media edition','open')",[edition]);
    for(let n=0;n<2;n++){
      await fixture.db.query("INSERT INTO schools(id,reference,name,address,city,state,postal_code,status) VALUES($1,$2,$3,'Street','City','State','100000','active')",[schools[n],schools[n],`Private school ${n}`]);
      await fixture.db.query("INSERT INTO students(id,reference,name,guardian_contact) VALUES($1,$2,'Private student name','private-contact')",[students[n],students[n]]);
      await fixture.db.query("INSERT INTO student_participations(id,student_id,school_id,edition_id,class,snapshot) VALUES($1,$2,$3,$4,6,'{}')",[participations[n],students[n],schools[n],edition]);
      await fixture.db.query("INSERT INTO consents(id,student_id,edition_id,actor_id,purpose,wording_version,wording,accepted,created_at) VALUES($1,$2,$3,$4,'publication','approved-1','Separate publication wording',true,now()-interval '1 hour')",[consentIds[n],students[n],edition,owner]);
    }
    await fixture.db.query("INSERT INTO competitions(id,edition_id,slug,title,guidelines,opens_at,closes_at,config) VALUES($1,$2,'public','Competition','Guidelines',now()-interval '1 day',now()+interval '1 day','{}')",[competition,edition]);
    for(const submissionId of [entry,otherEntry])await fixture.db.query("INSERT INTO submissions(id,reference,student_participation_id,competition_id,category_id,state,revision) VALUES($1,$2,$3,$4,'junior','submitted',1)",[submissionId,submissionId,participations[0],competition]);
    await fixture.db.query('INSERT INTO submission_members(submission_id,participation_id) VALUES($1,$2)',[entry,participations[1]]);
    for(const assetId of [asset,otherAsset])await fixture.db.query("INSERT INTO assets(id,submission_id,revision,uploader_id,original_name,storage_key,mime_type,byte_size,checksum,status,expected_size,expected_checksum,part_size,storage_version,storage_etag) VALUES($1,$2,1,$3,'ChildName_SchoolName_video.mp4',$4,'video/mp4',$5,$6,'ready',$5,$6,8388608,'approved-version','approved-etag')",[assetId,entry,owner,`submissions/${entry}/${assetId}`,bytes.length,'a'.repeat(64)]);
    await fixture.db.query("INSERT INTO submission_revisions(id,submission_id,version,answers,context,asset_ids,config,submitted_by) VALUES($1,$2,1,'{}','{}',$3,'{}',$4)",[id(),entry,JSON.stringify([asset,otherAsset]),owner]);
    await fixture.db.query("INSERT INTO publications(id,submission_id,revision,title,summary,approved_by,active,asset_ids) VALUES($1,$2,1,'Approved title','Approved summary',$3,true,$4)",[publication,entry,owner,JSON.stringify([asset])]);
  });
  beforeEach(async () => {
    reads=0;
    await fixture.db.query('DELETE FROM consents WHERE NOT(id=ANY($1::uuid[]))',[consentIds]);
    await fixture.db.query("UPDATE consents SET accepted=true,purpose='publication'");
    await fixture.db.query("UPDATE publications SET active=true,revision=1,asset_ids=$2 WHERE id=$1",[publication,JSON.stringify([asset])]);
    await fixture.db.query("UPDATE submissions SET revision=1,state='submitted',trashed_at=NULL,purging=false");
    await fixture.db.query("UPDATE assets SET submission_id=$1,revision=1,status='ready',trashed_at=NULL,mime_type='video/mp4'",[entry]);
    await fixture.db.query('UPDATE submission_revisions SET asset_ids=$2 WHERE submission_id=$1',[entry,JSON.stringify([asset,otherAsset])]);
    for(const table of ['schools','students'])await fixture.db.query(`UPDATE ${table} SET trashed_at=NULL,purging=false`);
    await fixture.db.query('UPDATE student_participations SET trashed_at=NULL');
  });
  afterAll(async()=>{vi.restoreAllMocks();await fixture?.close();});

  it('streams only the selected approved original with generated filename and no cache',async()=>{
    const response=await publicMedia(request(),publication,asset);
    expect(response.status).toBe(200);expect(await response.text()).toBe(bytes.toString());
    expect(response.headers.get('content-disposition')).toContain('submitted-file.mp4');
    expect(response.headers.get('content-disposition')).not.toContain('ChildName');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.has('location')).toBe(false);
    expect((await publicMedia(request(),publication,otherAsset)).status).toBe(404);expect(reads).toBe(1);
  });
  it('authorizes ranges and HEAD independently and rejects invalid ranges only after authorization',async()=>{
    const response=await publicMedia(request('GET','bytes=2-5'),publication,asset);
    expect(response.status).toBe(206);expect(await response.text()).toBe(bytes.subarray(2,6).toString());
    expect(response.headers.get('content-range')).toBe(`bytes 2-5/${bytes.length}`);
    const head=await publicMedia(request('HEAD','bytes=-4'),publication,asset);
    expect(head.status).toBe(206);expect(await head.text()).toBe('');expect(reads).toBe(1);
    expect((await publicMedia(request('GET','bytes=999-1000'),publication,asset)).status).toBe(416);
    await fixture.db.query('UPDATE publications SET active=false');
    expect((await publicMedia(request('GET','bytes=999-1000'),publication,asset)).status).toBe(404);
    expect((await publicMedia(request('HEAD'),publication,asset)).status).toBe(404);expect(reads).toBe(1);
  });
  it('rechecks the latest separate consent for the lead and every team member even when publication remains active',async()=>{
    for(const studentId of students){
      const withdrawal=id();
      await fixture.db.query("INSERT INTO consents(id,student_id,edition_id,actor_id,purpose,wording_version,wording,accepted,created_at) VALUES($1,$2,$3,$4,'publication','approved-1','Withdrawn',false,now())",[withdrawal,studentId,edition,owner]);
      expect((await publicMedia(request('GET','bytes=0-3'),publication,asset)).status).toBe(404);
      expect((await publicMedia(request('HEAD'),publication,asset)).status).toBe(404);
      await fixture.db.query('DELETE FROM consents WHERE id=$1',[withdrawal]);
    }
    await fixture.db.query("UPDATE consents SET purpose='participation'");
    expect((await publicMedia(request(),publication,asset)).status).toBe(404);
    await fixture.db.query("UPDATE consents SET purpose='publication'");
    expect(reads).toBe(0);
  });
  it('blocks public bytes when any lead or team parent is trashed or purging',async()=>{
    for(const [table,ids] of [['schools',schools],['students',students],['student_participations',participations]] as const){
      for(const parentId of ids){
        await fixture.db.query(`UPDATE ${table} SET trashed_at=now() WHERE id=$1`,[parentId]);
        expect((await publicMedia(request(),publication,asset)).status).toBe(404);
        await fixture.db.query(`UPDATE ${table} SET trashed_at=NULL WHERE id=$1`,[parentId]);
        if(table!=='student_participations'){
          await fixture.db.query(`UPDATE ${table} SET purging=true WHERE id=$1`,[parentId]);
          expect((await publicMedia(request('HEAD'),publication,asset)).status).toBe(404);
          await fixture.db.query(`UPDATE ${table} SET purging=false WHERE id=$1`,[parentId]);
        }
      }
    }
    expect(reads).toBe(0);
  });
  it.each([
    "UPDATE submissions SET trashed_at=now()",
    "UPDATE submissions SET purging=true",
    "UPDATE submissions SET revision=2",
    "UPDATE submissions SET state='draft'",
    "UPDATE publications SET revision=2",
    "UPDATE publications SET asset_ids='[]'",
    "UPDATE assets SET revision=2",
    "UPDATE assets SET status='quarantined'",
    "UPDATE assets SET trashed_at=now()",
  ])('fails closed after an approval prerequisite changes: %s',async sql=>{
    await fixture.db.query(sql);
    expect((await publicMedia(request(),publication,asset)).status).toBe(404);expect(reads).toBe(0);
  });
  it('rejects a selected asset from another entry and unknown references',async()=>{
    await fixture.db.query('UPDATE assets SET submission_id=$1 WHERE id=$2',[otherEntry,asset]);
    expect((await publicMedia(request(),publication,asset)).status).toBe(404);
    expect((await publicMedia(request(),id(),asset)).status).toBe(404);
    expect((await publicMedia(request(),'invalid',asset)).status).toBe(404);expect(reads).toBe(0);
  });
  it('forces active document formats to download rather than inline execution',async()=>{
    await fixture.db.query("UPDATE assets SET mime_type='image/svg+xml' WHERE id=$1",[asset]);
    const response=await publicMedia(request(),publication,asset);
    expect(response.headers.get('content-disposition')).toMatch(/^attachment;/);
    expect(response.headers.get('content-security-policy')).toContain('sandbox');
    await response.arrayBuffer();
  });
  it('lists only current approved metadata and selected files, rechecking consent and team parents',async()=>{
    const listed=await showcaseList(fixture.db);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toEqual({id:publication,title:'Approved title',summary:'Approved summary',award:null,competition:'Competition',assets:[{id:asset,mime_type:'video/mp4'}]});
    await fixture.db.query('UPDATE consents SET accepted=false WHERE student_id=$1',[students[1]]);
    expect(await showcaseList(fixture.db)).toEqual([]);
    await fixture.db.query('UPDATE consents SET accepted=true');
    await fixture.db.query('UPDATE schools SET purging=true WHERE id=$1',[schools[1]]);
    expect(await showcaseList(fixture.db)).toEqual([]);
  });
  it('requires explicit media moderation and rejects foreign, stale, or missing selections',async()=>{
    const actor={id:owner,role:'owner' as const};
    const input={entryId:entry,title:'Approved title',summary:'Approved summary',active:true,assetIds:[asset]};
    await expect(publish(fixture.db,actor,input)).rejects.toThrow('moderation');
    await expect(publish(fixture.db,actor,{...input,mediaApproved:true,assetIds:[id()]})).rejects.toThrow('current submitted revision');
    await fixture.db.query('UPDATE assets SET revision=2 WHERE id=$1',[asset]);
    await expect(publish(fixture.db,actor,{...input,mediaApproved:true})).rejects.toThrow('current submitted revision');
    await fixture.db.query('UPDATE assets SET revision=1,submission_id=$2 WHERE id=$1',[asset,otherEntry]);
    await expect(publish(fixture.db,actor,{...input,mediaApproved:true})).rejects.toThrow('current submitted revision');
    await fixture.db.query('UPDATE assets SET submission_id=$2 WHERE id=$1',[asset,entry]);
    const approved=await publish(fixture.db,actor,{...input,mediaApproved:true});
    expect(approved.asset_ids).toEqual([asset]);
    const {rows:[saved]}=await fixture.db.query('SELECT asset_ids FROM publications WHERE id=$1',[publication]);
    expect(saved.asset_ids).toEqual([asset]);
  });
  it('never publishes a recovered discarded file absent from the immutable submitted selection',async()=>{
    await fixture.db.query('UPDATE submission_revisions SET asset_ids=$2 WHERE submission_id=$1',[entry,JSON.stringify([otherAsset])]);
    expect((await publicMedia(request(),publication,asset)).status).toBe(404);
    expect((await showcaseList(fixture.db))[0].assets).toEqual([]);
    await expect(publish(fixture.db,{id:owner,role:'owner'},{entryId:entry,title:'Approved title',summary:'Approved summary',active:true,assetIds:[asset],mediaApproved:true})).rejects.toThrow();
    expect(reads).toBe(0);
  });
});
