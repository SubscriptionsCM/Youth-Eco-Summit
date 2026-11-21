/** Real loopback-only MP4 recovery check. Requires a fresh, dedicated QA database. */
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { SMTPServer } from 'smtp-server';
import { db } from '../src/server/db';
import { hashPassword } from '../src/server/auth';
import { sendTransactionalEmail } from '../src/server/email';
import { objectStore } from '../src/server/storage/provider';

const origin = new URL(process.env.APP_ORIGIN || 'http://invalid');
const database = new URL(process.env.DATABASE_URL || 'http://invalid');
const root = resolve(process.env.YES_MP4_QA_ROOT || '/invalid');
const loopback = (host: string) => ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(host);
assert.equal(process.env.YES_MIGRATION_QA, 'true');
assert.equal(process.env.YES_MIGRATION_QA_CAPTURE_ONLY, 'true');
assert.ok(loopback(origin.hostname) && origin.protocol === 'http:' && origin.port === '4300');
assert.ok(loopback(database.hostname) && database.port === '55433');
assert.equal(database.pathname, '/yes_local_migration', 'Refusing production or shared database access.');
assert.ok(isAbsolute(root) && root.includes('/yes-migration-20261120/yes-mp4-qa-'));
assert.equal(process.env.STORAGE_PROVIDER, 'filesystem');
assert.equal(resolve(process.env.STORAGE_LOCAL_ROOT || ''), join(root, 'storage'));
assert.equal(process.env.AUTH_PARTICIPANT_PROVIDER, 'native');
assert.equal(process.env.EMAIL_TRANSPORT, 'smtp');
assert.equal(process.env.SMTP_TEST_MODE, 'true');
assert.ok(loopback(process.env.SMTP_HOST || ''));
assert.equal(process.env.SMTP_PORT, '1025');
assert.ok(!process.env.SENDMAIL_PATH && !process.env.WORDPRESS_ROOT && !process.env.WORDPRESS_BRIDGE_PATH);
assert.ok(!process.env.STORAGE_DEV_SKIP_SCAN && !process.env.FILE_SCAN_URL && !process.env.FILE_SCAN_UPDATE_COMMAND);
assert.ok(process.env.FILE_SCAN_COMMAND?.startsWith(root + '/'));
assert.ok(process.env.FILE_SCAN_DATABASE?.startsWith(root + '/'));
process.umask(0o077);

const exec = promisify(execFile);
const pause = (ms: number) => new Promise(resolvePromise => setTimeout(resolvePromise, ms));
const sha = (body: Uint8Array) => createHash('sha256').update(body).digest('hex');
const checks: string[] = [];
const checked = (value: string) => { checks.push(value); console.log('PASS ' + value); };
const prefix = 'YES-MP4-QA-' + Date.now().toString(36);
const cookies = new Map<string, string>();
let capturedMessages = 0;

async function request(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(new URL(path, origin), { method, redirect: 'error', headers: {
    Origin: origin.origin, Cookie: [...cookies.values()].join('; '), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  for (const header of response.headers.getSetCookie()) { const pair = header.split(';', 1)[0]; cookies.set(pair.split('=', 1)[0], pair); }
  return response;
}
async function api(path: string, method = 'GET', body?: unknown) {
  const response = await request(path, method, body), value = await response.json();
  assert.ok(response.ok && !value.error, `${method} ${path}: ${response.status} ${value.error || ''}`);
  return value.data;
}
function transferUrl(value: string) {
  const url = new URL(value); assert.equal(url.origin, origin.origin); assert.equal(url.pathname, '/api/private-storage'); return url;
}
async function put(url: string, bytes: Uint8Array) {
  return fetch(transferUrl(url), { method: 'PUT', redirect: 'error', headers: { Origin: origin.origin, Cookie: [...cookies.values()].join('; ') }, body: bytes as Uint8Array<ArrayBuffer> });
}

async function interrupt(url: string, bytes: Uint8Array) {
  transferUrl(url);
  let written = 0, staged = false;
  let finish!: () => void;
  const closed = new Promise<void>(resolvePromise => { finish = resolvePromise; });
  const outgoing = httpRequest(url, { method: 'PUT', headers: { Origin: origin.origin, Cookie: [...cookies.values()].join('; '), 'Content-Length': String(bytes.length) } });
  outgoing.on('error', finish); outgoing.on('close', finish); outgoing.on('response', response => response.resume());
  outgoing.flushHeaders();
  await new Promise<void>((ok, fail) => outgoing.write(bytes.subarray(0, 1024 * 1024), error => error ? fail(error) : ok()));
  written = outgoing.socket?.bytesWritten || 0;
  try {
    for (let attempt = 0; attempt < 40; attempt++) {
      const paths = await readdir(join(root, 'storage/staging')).catch(() => []);
      if (paths.length) { staged = true; break; }
      await pause(100);
    }
  } finally { outgoing.destroy(new Error('Intentional QA connection interruption')); }
  await closed;
  assert.ok(written >= 1024 * 1024, 'The interrupted request must actually send a partial body.');
  for (let attempt = 0; attempt < 100; attempt++) {
    if (!(await readdir(join(root, 'storage/staging'))).length) break;
    await pause(100);
  }
  assert.equal((await readdir(join(root, 'storage/staging'))).length, 0, 'Aborted temporary bytes must be removed.');
  return { partialBytesWritten: written, privatePartialObserved: staged };
}

async function main() {
  assert.equal((await db.query('SELECT current_database() name')).rows[0].name, 'yes_local_migration');
  assert.equal((await db.query('SELECT count(*)::int n FROM users')).rows[0].n, 0, 'Use a fresh dedicated QA database.');
  assert.equal((await db.query('SELECT count(*)::int n FROM jobs')).rows[0].n, 0);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const smtp = new SMTPServer({ secure: false, allowInsecureAuth: true, disabledCommands: ['STARTTLS'], logger: false,
    onConnect(session, callback) { callback(loopback(session.remoteAddress.replace('::ffff:', '')) ? undefined : new Error('Loopback only')); },
    onAuth(auth, _session, callback) { callback(auth.username === process.env.SMTP_USER && auth.password === process.env.SMTP_PASSWORD ? null : new Error('Invalid QA authentication'), { user: 'mp4-qa' }); },
    onRcptTo(address, _session, callback) { callback(address.address.toLowerCase().endsWith('.test') ? undefined : new Error('Synthetic recipients only')); },
    onData(stream, _session, callback) { stream.resume(); stream.on('end', () => { capturedMessages++; callback(null); }); stream.on('error', () => callback(new Error('Capture failed'))); },
  });
  await new Promise<void>((ok, fail) => { smtp.once('error', fail); smtp.listen(1025, '127.0.0.1', ok); });
  try {
    await sendTransactionalEmail({ to: prefix.toLowerCase() + '@example.test', subject: 'Capture-only MP4 QA', body: 'Synthetic loopback capture; never externally delivered.' });
    assert.equal(capturedMessages, 1);
    checked('SMTP accepts only local capture and synthetic recipients');
    const path = join(root, 'recovery.mp4');
    await exec('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30', '-t', '8', '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '2', '-pix_fmt', 'yuv420p', '-b:v', '16M', '-minrate', '16M', '-maxrate', '16M', '-bufsize', '16M', '-x264-params', 'nal-hrd=cbr:force-cfr=1', '-movflags', '+faststart', path], { timeout: 120000, maxBuffer: 65536 });
    const bytes = await readFile(path), checksum = sha(bytes);
    const probe = JSON.parse((await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,width,height', '-of', 'json', path], { timeout: 20000 })).stdout);
    assert.ok(bytes.length > 10 * 1024 ** 2 && bytes.length < 120 * 1024 ** 2);
    assert.equal(probe.streams[0].codec_name, 'h264'); assert.ok(Number(probe.format.duration) < 10);
    checked('Generated a real H.264 MP4 larger than 10 MiB and shorter than 10 seconds');
    const userId = randomUUID(), password = randomBytes(24).toString('base64url'), contact = prefix.toLowerCase() + '@example.test';
    await db.query("INSERT INTO users(id,role,contact,name,password_hash) VALUES($1,'participant',$2,$3,$4)", [userId, contact, prefix, await hashPassword(password)]);
    await db.query('INSERT INTO native_participant_accounts(user_id,username,verified_contact) VALUES($1,$2,$3)', [userId, prefix.toLowerCase(), contact]);
    assert.equal((await api('/api/auth/participant/login', 'POST', { contact, password })).actor.id, userId);
    const draft = await api('/api/forms/records', 'POST', { formKey: 'short-film-making', context: { 'hidden-yes-submitter': 'educator', 'radio-yes-entry-mode': 'individual' } });
    const declaration = { recordId: draft.record.id, fieldId: 'upload-yes-1', filename: prefix + '.mp4', size: bytes.length, checksum };
    const first = await api('/api/forms/files/begin', 'POST', declaration), repeated = await api('/api/forms/files/begin', 'POST', declaration);
    assert.equal(first.id, repeated.id); assert.equal(first.partSize, 5242880);
    const row = (await db.query('SELECT * FROM portal_form_files WHERE id=$1', [first.id])).rows[0];
    const store = objectStore();
    const count = Math.ceil(bytes.length / first.partSize); assert.ok(count >= 3);
    let interrupted: Record<string, unknown> = {};
    for (let part = 1; part <= count; part++) {
      const chunk = bytes.subarray((part - 1) * first.partSize, Math.min(part * first.partSize, bytes.length));
      let signed = await api(`/api/forms/files/${first.id}/part`, 'POST', { partNumber: part });
      if (part === 2) {
        interrupted = await interrupt(signed.url, chunk);
        assert.ok(!(await store.parts(row.storage_key, row.upload_id)).some(item => item.PartNumber === 2));
        signed = await api(`/api/forms/files/${first.id}/part`, 'POST', { partNumber: part });
      }
      const response = await put(signed.url, chunk); assert.equal(response.status, 200);
      if (part === 2) {
        const duplicate = await put((await api(`/api/forms/files/${first.id}/part`, 'POST', { partNumber: part })).url, chunk);
        assert.equal(duplicate.status, 200); assert.equal(duplicate.headers.get('etag'), response.headers.get('etag'));
      }
    }
    assert.equal((await store.parts(row.storage_key, row.upload_id)).length, count);
    checked('Uploaded every part, interrupted the middle connection, removed partial bytes and retried identical bytes safely');
    await api(`/api/forms/files/${first.id}/complete`, 'POST', {});
    await api(`/api/forms/files/${first.id}/complete`, 'POST', {});
    assert.equal((await db.query("SELECT count(*)::int n FROM jobs WHERE kind='verify_portal_file' AND payload->>'fileId'=$1", [first.id])).rows[0].n, 1);
    let verified: Record<string, any> | undefined;
    for (let attempt = 0; attempt < 180; attempt++) {
      verified = (await db.query('SELECT * FROM portal_form_files WHERE id=$1', [first.id])).rows[0];
      if (verified?.status === 'ready' || verified?.status === 'rejected') break;
      await pause(1000);
    }
    assert.equal(verified?.status, 'ready', 'The real worker must finish verification.');
    assert.equal(verified!.mime_type, 'video/mp4'); assert.equal(verified!.metadata.scan.status, 'clean');
    assert.equal(verified!.metadata.scan.detail.engine, 'ClamAV');
    assert.equal(verified!.metadata.width, 1280); assert.equal(verified!.metadata.height, 720);
    assert.ok(verified!.metadata.durationSeconds > 0 && verified!.metadata.durationSeconds < 10);
    assert.ok(verified!.metadata.scan.detail.durationSeconds > 0 && verified!.metadata.scan.detail.durationSeconds < 10);
    assert.equal((await api('/api/forms/files/begin', 'POST', declaration)).id, first.id);
    await api(`/api/forms/files/${first.id}/complete`, 'POST', {});
    assert.equal((await db.query('SELECT count(*)::int n FROM portal_form_files')).rows[0].n, 1);
    checked('Duplicate begin/completion retain one file and one real ClamAV/ffprobe worker verification job');
    const getDownload = async () => transferUrl((await api(`/api/forms/files/${first.id}/download`, 'POST', {})).url);
    const headers = { Origin: origin.origin, Cookie: [...cookies.values()].join('; ') };
    const full = await fetch(await getDownload(), { headers, redirect: 'error' });
    assert.equal(full.status, 200); assert.equal(sha(new Uint8Array(await full.arrayBuffer())), checksum);
    const start = first.partSize - 4096, end = first.partSize + 4095;
    const range = await fetch(await getDownload(), { headers: { ...headers, Range: `bytes=${start}-${end}` }, redirect: 'error' });
    assert.equal(range.status, 206); assert.equal(range.headers.get('content-range'), `bytes ${start}-${end}/${bytes.length}`);
    assert.equal(sha(new Uint8Array(await range.arrayBuffer())), sha(bytes.subarray(start, end + 1)));
    const head = await fetch(await getDownload(), { method: 'HEAD', headers, redirect: 'error' });
    assert.equal(head.status, 200); assert.equal(head.headers.get('content-length'), String(bytes.length));
    assert.equal((await fetch(await getDownload(), { redirect: 'error' })).status, 404);
    checked('Authenticated full download, cross-part byte range, HEAD and anonymous denial preserve the exact MP4');
    const { rows: jobs } = await db.query("SELECT status,attempts FROM jobs WHERE kind='verify_portal_file' AND payload->>'fileId'=$1", [first.id]);
    assert.equal(jobs.length, 1); assert.equal(jobs[0].status, 'complete');
    const report = { verifiedAt: new Date().toISOString(), checks, bytes: bytes.length, checksum,
      durationSeconds: Number(probe.format.duration), codec: probe.streams[0].codec_name, parts: count, interrupted,
      metadata: verified!.metadata, verificationJob: jobs[0], capturedMessages, productionWrites: false, externalMail: false,
      limitations: ['Uses a synthetic eight-second H.264 MP4, not the reported person’s original file/device.', 'Exercises the real HTTP/storage/worker path without browser upload controls.', 'No final competition submission and no participation-date changes.'] };
    await writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
    console.log(JSON.stringify({ ok: true, bytes: bytes.length, parts: count, durationSeconds: Number(probe.format.duration), codec: 'h264', engine: 'ClamAV', checks: checks.length, report: join(root, 'report.json') }));
  } finally { await new Promise<void>(ok => smtp.close(() => ok())); }
}
main().then(() => setTimeout(() => process.exit(0), 50)).catch(error => { console.error(error instanceof Error ? error.message : 'MP4 QA failed.'); process.exit(1); });
