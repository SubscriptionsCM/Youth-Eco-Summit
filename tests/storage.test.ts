import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { inspectContent, parseRange, safeDisposition } from '../src/server/storage/validation';
import { S3Store } from '../src/server/storage/provider';
import { S3Client } from '@aws-sdk/client-s3';
import { scanContent } from '../src/server/storage/scanner';
import * as provider from '../src/server/storage/provider';
import { storageAction, verifyAsset } from '../src/server/storage';
import { db as liveDb } from '../src/server/db';
import { id, type Actor } from '../src/server/core';

const pdf = Buffer.from('%PDF-1.7\n retained work');
async function* chunks(bytes: Uint8Array) { for (let i = 0; i < bytes.length; i += 3) yield bytes.subarray(i, i + 3); }
const checksum = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

describe('retained content verification', () => {
  it('hashes the entire stream and detects actual format independently of filename', async () => {
    const result = await inspectContent(chunks(pdf), { size: pdf.length, checksum: checksum(pdf), maxBytes: 1000, types: ['application/pdf'] });
    expect(result).toEqual({ byteSize: pdf.length, checksum: checksum(pdf), mimeType: 'application/pdf' });
  });
  it('rejects truncated uploads and corrupt checksums', async () => {
    await expect(inspectContent(chunks(pdf), { size: pdf.length + 1, checksum: checksum(pdf), maxBytes: 1000, types: ['application/pdf'] })).rejects.toThrow(/size/);
    await expect(inspectContent(chunks(pdf), { size: pdf.length, checksum: 'a'.repeat(64), maxBytes: 1000, types: ['application/pdf'] })).rejects.toThrow(/checksum/);
  });
  it('rejects disguised active HTML and unknown binary instead of trusting MIME declarations', async () => {
    for (const bytes of [Buffer.from('<html><script>alert(1)</script></html>'), Buffer.from([0, 4, 8, 0, 123, 1])]) {
      await expect(inspectContent(chunks(bytes), { size: bytes.length, checksum: checksum(bytes), maxBytes: 1000, types: ['image/png'] })).rejects.toThrow(/type/);
    }
  });
  it('stops consuming a stream once the configured maximum is exceeded', async () => {
    let reads = 0;
    async function* huge() { for (let n = 0; n < 100; n++) { reads++; yield Buffer.alloc(50); } }
    await expect(inspectContent(huge(), { size: 5000, checksum: 'a'.repeat(64), maxBytes: 100, types: ['application/pdf'] })).rejects.toThrow(/size/);
    expect(reads).toBeLessThanOrEqual(3);
  });
  it('accepts explicitly allowed source text without executing it', async () => {
    const bytes = Buffer.from('console.log("student source");');
    expect((await inspectContent(chunks(bytes), { size: bytes.length, checksum: checksum(bytes), maxBytes: 1000, types: ['text/plain'] })).mimeType).toBe('text/plain');
  });
});

describe('authorized media response helpers', () => {
  it('supports bounded, open-ended and suffix video byte ranges', () => {
    expect(parseRange('bytes=2-5', 10)).toEqual({ start: 2, end: 5 });
    expect(parseRange('bytes=2-', 10)).toEqual({ start: 2, end: 9 });
    expect(parseRange('bytes=-3', 10)).toEqual({ start: 7, end: 9 });
    expect(parseRange('bytes=2-100', 10)).toEqual({ start: 2, end: 9 });
    for (const value of ['bytes=20-30', 'bytes=5-2', 'bytes=0-1,3-4', 'bytes=-0', 'bytes=']) expect(() => parseRange(value, 10)).toThrow();
  });
  it('serves active formats as attachment and prevents filename header injection', () => {
    expect(safeDisposition('image/svg+xml', 'bad\r\nHeader: yes.svg')).toMatch(/^attachment;/);
    expect(safeDisposition('image/png', 'art.png')).toMatch(/^inline;/);
    expect(safeDisposition('application/pdf', 'essay.pdf')).toMatch(/^attachment;/);
    expect(safeDisposition('video/mp4', 'film.mp4')).toMatch(/^inline;/);
    expect(safeDisposition('text/plain', 'bad\r\nHeader: yes.txt')).not.toMatch(/[\r\n]/);
  });
});

describe('permanent object deletion', () => {
  const key = 'submissions/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222';
  it('deletes versions and delete markers, then verifies no live object remains', async () => {
    const calls: string[] = [];
    let versions = true;
    const client = { async send(command: { constructor: { name: string }; input: any }) {
      const name = command.constructor.name; calls.push(name);
      if (name === 'ListMultipartUploadsCommand') return { Uploads: [{ Key: key, UploadId: 'unfinished' }] };
      if (name === 'ListObjectVersionsCommand') return versions ? { Versions: [{ Key: key, VersionId: 'original' }], DeleteMarkers: [{ Key: key, VersionId: 'marker' }] } : {};
      if (name === 'DeleteObjectsCommand') { expect(command.input.Delete.Objects).toHaveLength(2); versions = false; return {}; }
      if (name === 'HeadObjectCommand') throw Object.assign(new Error('missing'), { name: 'NotFound' });
      return {};
    } } as unknown as S3Client;
    await new S3Store(client, 'private').purge([key]);
    expect(calls).toContain('AbortMultipartUploadCommand');
    expect(calls.at(-1)).toBe('HeadObjectCommand');
  });
  it('does not report purge success if provider reports failed version deletion', async () => {
    const client = { async send(command: { constructor: { name: string } }) {
      if (command.constructor.name === 'ListObjectVersionsCommand') return { Versions: [{ Key: key, VersionId: 'locked' }] };
      if (command.constructor.name === 'DeleteObjectsCommand') return { Errors: [{ Code: 'AccessDenied' }] };
      return {};
    } } as unknown as S3Client;
    await expect(new S3Store(client, 'private').purge([key])).rejects.toThrow('AccessDenied');
  });
  it('refuses arbitrary storage prefixes', async () => {
    await expect(new S3Store({} as S3Client, 'private').purge(['submissions/'])).rejects.toThrow('invalid storage key');
  });
});

describe('external security screening', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  const meta = { checksum: checksum(pdf), mimeType: 'video/mp4', byteSize: pdf.length };
  it('fails closed without the scanner even if bypass is requested in production', async () => {
    vi.stubEnv('FILE_SCAN_URL', ''); vi.stubEnv('STORAGE_DEV_SKIP_SCAN', 'true'); vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('APP_ENV', 'development');
    await expect(scanContent(chunks(pdf), meta)).rejects.toThrow('not configured');
  });
  it('rejects malware and a duration violation; never accepts a mismatched scanner hash', async () => {
    vi.stubEnv('FILE_SCAN_URL', 'https://scanner.example.test/scan'); vi.stubEnv('STORAGE_DEV_SKIP_SCAN', 'false');
    vi.stubGlobal('fetch', async () => Response.json({ clean: false }));
    await expect(scanContent(chunks(pdf), meta)).rejects.toThrow('security screening');
    vi.stubGlobal('fetch', async () => Response.json({ clean: true, sha256: 'other' }));
    await expect(scanContent(chunks(pdf), meta)).rejects.toThrow('unverified');
    vi.stubGlobal('fetch', async () => Response.json({ clean: true, sha256: meta.checksum, durationSeconds: 100 }));
    await expect(scanContent(chunks(pdf), meta, 60)).rejects.toThrow('duration');
    vi.stubGlobal('fetch', async () => Response.json({ clean: true, sha256: meta.checksum }));
    await expect(scanContent(chunks(pdf), meta, 60)).rejects.toThrow('duration');
  });
});

describe('multipart and media authorization with real SQL', () => {
  let database: Awaited<ReturnType<typeof import('./helpers/db').testDb>>;
  const parent: Actor = { id: id(), role: 'participant' }, stranger: Actor = { id: id(), role: 'participant' }, judge: Actor = { id: id(), role: 'judge' }, admin: Actor = { id: id(), role: 'admin' };
  const school = id(), student = id(), participation = id(), edition = id(), competition = id(), entry = id(), round = id(), assignment = id();
  let assetId: string, completed = false, hasPart = false, reads = 0;
  const req = (path: string, body?: unknown, headers?: HeadersInit) => new Request(`https://summit.test/api/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const store = {
    async begin() { return 'upload-one'; },
    async sign() { return 'https://private.example.test/upload-only'; },
    async parts() { if (completed) throw Object.assign(new Error('completed'), { name: 'NoSuchUpload' }); return hasPart ? [{ PartNumber: 1, Size: pdf.length, ETag: 'part' }] : []; },
    async complete() { completed = true; return {}; },
    async head() { if (!completed) throw Object.assign(new Error('missing'), { name: 'NotFound' }); return { ContentLength: pdf.length, VersionId: 'v1', ETag: 'retained' }; },
    async read(_key: string, _version?: string, _etag?: string, range?: string) { reads++; const bounds = range ? parseRange(range, pdf.length) : { start: 0, end: pdf.length - 1 }; return { Body: chunks(pdf.subarray(bounds.start, bounds.end + 1)) }; }
  } as unknown as S3Store;
  beforeAll(async () => {
    const { testDb } = await import('./helpers/db');
    database = await testDb();
    vi.spyOn(liveDb, 'query').mockImplementation((sql, params) => database.db.query(sql, params));
    vi.spyOn(liveDb, 'transaction').mockImplementation(fn => database.db.transaction(fn));
    vi.spyOn(provider, 'objectStore').mockReturnValue(store);
    for (const actor of [parent, stranger, judge, admin]) await database.db.query('INSERT INTO users(id,role,contact) VALUES($1,$2,$3)', [actor.id, actor.role, actor.id]);
    await database.db.query("INSERT INTO editions(id,label,state) VALUES($1,'Storage tests','open')", [edition]);
    await database.db.query("INSERT INTO schools(id,reference,name,address,city,state,postal_code,status) VALUES($1,$2,'School','Street','City','State','100000','active')", [school, school]);
    await database.db.query("INSERT INTO students(id,reference,name,guardian_contact) VALUES($1,$2,'Student','guardian')", [student, student]);
    await database.db.query('INSERT INTO participant_access(user_id,student_id) VALUES($1,$2)', [parent.id, student]);
    await database.db.query("INSERT INTO student_participations(id,student_id,school_id,edition_id,class,snapshot) VALUES($1,$2,$3,$4,5,'{}')", [participation, student, school, edition]);
    await database.db.query("INSERT INTO competitions(id,edition_id,slug,title,guidelines,status,opens_at,closes_at,config) VALUES($1,$2,'files','Files','Approved','approved',now()-interval '1 day',now()+interval '1 day',$3)", [competition, edition, JSON.stringify({ files: { minCount: 1, maxCount: 1, maxBytes: 1000, types: ['application/pdf'] } })]);
    await database.db.query("INSERT INTO submissions(id,reference,student_participation_id,competition_id,category_id) VALUES($1,$2,$3,$4,'junior')", [entry, entry, participation, competition]);
  });
  afterAll(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); await database?.close(); });
  it('creates a draft upload but refuses another participant and invalid part numbers', async () => {
    const response = await storageAction(req('uploads/start', { submissionId: entry, originalName: 'essay.pdf', byteSize: pdf.length, checksum: checksum(pdf) }), parent, ['uploads','start']);
    assetId = (await response!.json()).data.id;
    await expect(storageAction(req(`uploads/${assetId}/parts`, { partNumber: 1 }), stranger, ['uploads',assetId,'parts'])).rejects.toThrow('Upload not found');
    await expect(storageAction(req(`uploads/${assetId}/parts`, { partNumber: 2 }), parent, ['uploads',assetId,'parts'])).rejects.toThrow('part number');
    const signed = await storageAction(req(`uploads/${assetId}/parts`, { partNumber: 1 }), parent, ['uploads',assetId,'parts']);
    expect((await signed!.json()).data.expiresIn).toBe(300);
  });
  it('blocks incomplete completion and queues exactly one durable verification after resume', async () => {
    await expect(storageAction(req(`uploads/${assetId}/complete`, {}), parent, ['uploads',assetId,'complete'])).rejects.toThrow('incomplete');
    expect(completed).toBe(false); hasPart = true;
    expect((await storageAction(req(`uploads/${assetId}/complete`, {}), parent, ['uploads',assetId,'complete']))!.status).toBe(202);
    await storageAction(req(`uploads/${assetId}/complete`, {}), parent, ['uploads',assetId,'complete']);
    expect((await database.db.query("SELECT * FROM jobs WHERE kind='verify_asset'")).rows).toHaveLength(1);
    await expect(storageAction(req(`media/${assetId}`), parent, ['media',assetId])).rejects.toThrow();
    // Simulate a process dying after S3 completion but before the metadata transaction commits.
    await database.db.query("UPDATE assets SET status='uploading' WHERE id=$1", [assetId]);
    const recovery = await storageAction(req(`uploads/${assetId}`), parent, ['uploads',assetId]);
    expect((await recovery!.json()).data.needsCompletion).toBe(true);
    await storageAction(req(`uploads/${assetId}/complete`, {}), parent, ['uploads',assetId,'complete']);
  });
  it('verifies retained bytes before making the asset accessible', async () => {
    vi.stubEnv('FILE_SCAN_URL','https://scanner.example.test/scan'); vi.stubEnv('STORAGE_DEV_SKIP_SCAN','false');
    vi.stubGlobal('fetch', async () => Response.json({ clean:true, sha256:checksum(pdf), engine:'test-scanner' }));
    await verifyAsset(database.db, assetId);
    const asset = (await database.db.query('SELECT * FROM assets WHERE id=$1',[assetId])).rows[0];
    expect(asset.status).toBe('ready'); expect(asset.checksum).toBe(checksum(pdf)); expect(asset.mime_type).toBe('application/pdf');
  });
  it('reauthorizes every judge range request after revocation and denies Trash even to the owner', async () => {
    await database.db.query("UPDATE submissions SET state='submitted',revision=1 WHERE id=$1",[entry]);
    await database.db.query("INSERT INTO submission_revisions(id,submission_id,version,answers,context,asset_ids,config,submitted_by) VALUES($1,$2,1,'{}','{}',$3,'{}',$4)",[id(),entry,JSON.stringify([assetId]),parent.id]);
    await database.db.query("INSERT INTO review_rounds(id,competition_id,name,kind,eligible_states,open,rubric) VALUES($1,$2,'Round','screening','[\"submitted\"]',true,'{}')",[round,competition]);
    await database.db.query('INSERT INTO judge_assignments(id,submission_id,judge_id,round_id,revision) VALUES($1,$2,$3,$4,1)',[assignment,entry,judge.id,round]);
    const response = await storageAction(req(`media/${assetId}`,undefined,{ Range:'bytes=0-3' }),judge,['media',assetId]);
    expect(response!.status).toBe(206); expect(await response!.text()).toBe('%PDF');
    const before = reads;
    await database.db.query('UPDATE judge_assignments SET active=false,revoked_at=now() WHERE id=$1',[assignment]);
    await expect(storageAction(req(`media/${assetId}`,undefined,{ Range:'bytes=4-8' }),judge,['media',assetId])).rejects.toThrow();
    expect(reads).toBe(before);
    await database.db.query('UPDATE submissions SET trashed_at=now() WHERE id=$1',[entry]);
    await expect(storageAction(req(`media/${assetId}`),parent,['media',assetId])).rejects.toThrow();
    expect(reads).toBe(before);
  });
  it('recovers a discarded file only into the administrator archive without changing the submitted selection', async () => {
    const discarded=id();
    await database.db.query('UPDATE submissions SET trashed_at=NULL WHERE id=$1',[entry]);
    await database.db.query('UPDATE judge_assignments SET active=true,revoked_at=NULL WHERE id=$1',[assignment]);
    await database.db.query(`INSERT INTO assets(id,submission_id,revision,uploader_id,original_name,storage_key,mime_type,byte_size,checksum,expected_size,expected_checksum,status,part_size,storage_version,storage_etag,trashed_at,trashed_by,trash_reason)
      SELECT $2,submission_id,revision,uploader_id,'discarded-original.pdf',$3,mime_type,byte_size,checksum,expected_size,expected_checksum,status,part_size,storage_version,storage_etag,now(),uploader_id,'Replaced before submit' FROM assets WHERE id=$1`,[assetId,discarded,`submissions/${entry}/${discarded}`]);
    const before=(await database.db.query('SELECT * FROM assets WHERE id=$1',[discarded])).rows[0];
    const selection=(await database.db.query('SELECT * FROM submission_revisions WHERE submission_id=$1',[entry])).rows;
    const recover=()=>storageAction(req(`uploads/${discarded}/recover`,{reason:'Recover retained original for records'}),admin,['uploads',discarded,'recover']);
    await expect(storageAction(req(`uploads/${discarded}/restore`,{}),parent,['uploads',discarded,'restore'])).rejects.toThrow('draft');
    await expect(storageAction(req(`uploads/${discarded}/recover`,{reason:'Please recover'}),parent,['uploads',discarded,'recover'])).rejects.toThrow('Administrator');
    await database.db.query('UPDATE schools SET purging=true WHERE id=$1',[school]);
    await expect(recover()).rejects.toThrow('parent');
    await database.db.query('UPDATE schools SET purging=false WHERE id=$1',[school]);
    await database.db.query("UPDATE editions SET state='archived' WHERE id=$1",[edition]);
    const response=await recover();
    expect((await response!.json()).data).toEqual({id:discarded,trashed:false,archived:true,revision:1});
    const restored=(await database.db.query('SELECT * FROM assets WHERE id=$1',[discarded])).rows[0];
    for(const field of ['original_name','storage_key','checksum','storage_version','storage_etag','revision','created_at','status'])expect(restored[field]).toEqual(before[field]);
    expect((await database.db.query('SELECT * FROM submission_revisions WHERE submission_id=$1',[entry])).rows).toEqual(selection);
    const {rows:[event]}=await database.db.query("SELECT * FROM audit_events WHERE action='upload.archive_recover' AND entity_id=$1",[discarded]);
    expect(event.actor_id).toBe(admin.id);expect(event.detail.archiveOnly).toBe(true);expect(event.detail.previousTrash.reason).toBe('Replaced before submit');
    await expect(storageAction(req(`media/${discarded}`),parent,['media',discarded])).rejects.toThrow('File not found');
    await database.db.query("UPDATE editions SET state='open' WHERE id=$1",[edition]);
    await expect(storageAction(req(`media/${discarded}`),judge,['media',discarded])).rejects.toThrow('File not found');
    const original=await storageAction(req(`media/${discarded}`),admin,['media',discarded]);
    expect(original!.status).toBe(200);expect(await original!.text()).toBe(pdf.toString());
    const selected=await storageAction(req(`media/${assetId}`),judge,['media',assetId]);
    expect(selected!.status).toBe(200);await selected!.arrayBuffer();
  });
  it('does not use archive recovery to alter an immutable selected file or bypass verification', async () => {
    await database.db.query("UPDATE assets SET trashed_at=now() WHERE id=$1",[assetId]);
    await expect(storageAction(req(`uploads/${assetId}/recover`,{reason:'Selected snapshot must remain immutable'}),admin,['uploads',assetId,'recover'])).rejects.toThrow('immutable');
    await database.db.query('UPDATE assets SET trashed_at=NULL WHERE id=$1',[assetId]);
    const failed=id();
    await database.db.query(`INSERT INTO assets(id,submission_id,revision,uploader_id,original_name,storage_key,expected_size,expected_checksum,status,part_size,trashed_at)
      VALUES($1,$2,1,$3,'failed.pdf',$4,$5,$6,'failed',8388608,now())`,[failed,entry,parent.id,`submissions/${entry}/${failed}`,pdf.length,checksum(pdf)]);
    await storageAction(req(`uploads/${failed}/recover`,{reason:'Retain failed historical upload'}),admin,['uploads',failed,'recover']);
    expect((await database.db.query("SELECT id FROM jobs WHERE kind='verify_asset' AND payload->>'assetId'=$1",[failed])).rows).toHaveLength(1);
    await expect(storageAction(req(`media/${failed}`),admin,['media',failed])).rejects.toThrow('not available');
  });
});
