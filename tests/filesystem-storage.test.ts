import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { objectStore } from '../src/server/storage/provider';
import { FileSystemStore } from '../src/server/storage/filesystem';
import { signStorageUploadToken, verifyStorageUploadToken } from '../src/server/storage/tokens';

const secret = 'test-storage-secret-that-is-at-least-32-characters';
const key = 'submissions/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222';
const bytes = Buffer.from('private original file');
const checksum = (body: Uint8Array) => createHash('sha256').update(body).digest('hex');
async function* stream(body: Uint8Array) { for (let offset = 0; offset < body.length; offset += 3) yield body.subarray(offset, offset + 3); }
async function collect(body: AsyncIterable<Uint8Array>) { const chunks: Uint8Array[] = []; for await (const chunk of body) chunks.push(chunk); return Buffer.concat(chunks); }

describe('private filesystem provider selection', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('selects explicitly configured local storage without requiring S3 configuration', () => {
    vi.stubEnv('STORAGE_PROVIDER', 'filesystem');
    vi.stubEnv('STORAGE_LOCAL_ROOT', process.cwd());
    vi.stubEnv('AUTH_SECRET', 'test-storage-secret-that-is-at-least-32-characters');
    vi.stubEnv('APP_ORIGIN', 'https://summit.example.test');
    vi.stubEnv('S3_BUCKET', '');
    vi.stubEnv('S3_REGION', '');
    expect(() => objectStore()).not.toThrow();
    expect(objectStore().constructor.name).toBe('FileSystemStore');
  });
});

describe('immutable private filesystem objects', () => {
  let folder: string, store: FileSystemStore;
  beforeEach(async () => {
    const parent = resolve('.local/test-temp'); await mkdir(parent, { recursive: true });
    folder = await mkdtemp(join(parent, 'storage-'));
    store = new FileSystemStore(folder, secret, 'https://summit.example.test');
  });
  afterEach(async () => { if (folder) await rm(folder, { recursive: true, force: true }); });
  async function begin(body = bytes, partSize = 8) {
    return store.begin(key, { expectedSize: body.length, checksum: checksum(body), partSize });
  }
  async function put(uploadId: string, number: number, body: Uint8Array) {
    const url = new URL(await store.sign(key, uploadId, number, body.length));
    expect(url.origin + url.pathname).toBe('https://summit.example.test/api/private-storage');
    return store.receivePart(verifyStorageUploadToken(secret, url.searchParams.get('token')!), stream(body), body.length);
  }
  async function upload(uploadId: string, body = bytes, size = 8) {
    for (let offset = 0, number = 1; offset < body.length; offset += size, number++) await put(uploadId, number, body.subarray(offset, offset + size));
  }

  it('streams multipart objects, pins identity, serves ranges and completes repeatedly', async () => {
    const uploadId = await begin(); await upload(uploadId);
    const parts = await store.parts(key, uploadId);
    expect(parts.map(part => part.Size)).toEqual([8, 8, bytes.length - 16]);
    await Promise.all([store.complete(key, uploadId, parts), store.complete(key, uploadId, parts)]);
    const head = await store.head(key);
    expect(head).toMatchObject({ ContentLength: bytes.length, ETag: `"${checksum(bytes)}"`, VersionId: checksum(bytes) });
    expect(await collect((await store.read(key, head.VersionId, head.ETag)).Body!)).toEqual(bytes);
    expect(await collect((await store.read(key, head.VersionId, head.ETag, 'bytes=2-6')).Body!)).toEqual(bytes.subarray(2, 7));
    await expect(store.read(key, 'different')).rejects.toMatchObject({ status: 412 });
    await expect(store.read(key, undefined, 'different')).rejects.toMatchObject({ status: 412 });
    await store.complete(key, uploadId, parts);
  });

  it('accepts identical part retries and rejects conflicting bytes atomically', async () => {
    const uploadId = await begin();
    const original = bytes.subarray(0, 8);
    const results = await Promise.all([put(uploadId, 1, original), put(uploadId, 1, original)]);
    expect(results[0].ETag).toBe(results[1].ETag);
    await expect(put(uploadId, 1, Buffer.alloc(8, 120))).rejects.toMatchObject({ status: 409 });
    expect(await store.parts(key, uploadId)).toHaveLength(1);
  });

  it('rejects truncated or oversized bodies and never retains incomplete parts', async () => {
    const uploadId = await begin();
    const claims = verifyStorageUploadToken(secret, new URL(await store.sign(key, uploadId, 1, 8)).searchParams.get('token')!);
    await expect(store.receivePart(claims, stream(Buffer.alloc(7)))).rejects.toMatchObject({ status: 422 });
    await expect(store.receivePart(claims, stream(Buffer.alloc(9)))).rejects.toMatchObject({ status: 413 });
    await expect(store.receivePart(claims, stream(Buffer.alloc(8)), 7)).rejects.toMatchObject({ status: 422 });
    expect(await store.parts(key, uploadId)).toEqual([]);
    expect(await readdir(join(folder, 'staging'))).toEqual([]);
  });

  it('requires every exact part and verifies the complete checksum before publication', async () => {
    const uploadId = await begin(); await put(uploadId, 1, Buffer.alloc(8));
    await expect(store.complete(key, uploadId, await store.parts(key, uploadId))).rejects.toMatchObject({ status: 409 });
    await put(uploadId, 2, bytes.subarray(8, 16)); await put(uploadId, 3, bytes.subarray(16));
    await expect(store.complete(key, uploadId, await store.parts(key, uploadId))).rejects.toMatchObject({ status: 422 });
    await expect(store.head(key)).rejects.toMatchObject({ name: 'NotFound' });
  });

  it('bounds declarations, validates part claims and rejects arbitrary keys', async () => {
    await expect(store.begin('../outside', { expectedSize: bytes.length, checksum: checksum(bytes), partSize: 8 })).rejects.toThrow(/key/);
    await expect(store.begin(key)).rejects.toThrow(/declaration/i);
    await expect(store.begin(key, { expectedSize: 513 * 1024 ** 2, checksum: checksum(bytes), partSize: 8 })).rejects.toThrow(/limit/);
    await expect(store.begin(key, { expectedSize: bytes.length, checksum: checksum(bytes), partSize: 9 * 1024 ** 2 })).rejects.toThrow(/part/i);
    const uploadId = await begin();
    await expect(store.sign(key, uploadId, 1, 7)).rejects.toThrow(/part/i);
    await expect(store.sign(key, uploadId, 4, 8)).rejects.toThrow(/part/i);
    const other = key.replace('22222222', '33333333');
    await expect(store.parts(other, uploadId)).rejects.toThrow();
  });

  it('supports a declared 120 MiB original with bounded 8 MiB parts', async () => {
    const uploadId = await store.begin(key, { expectedSize: 120 * 1024 ** 2, checksum: 'a'.repeat(64), partSize: 8 * 1024 ** 2 });
    const url = new URL(await store.sign(key, uploadId, 15, 8 * 1024 ** 2));
    expect(verifyStorageUploadToken(secret, url.searchParams.get('token')!).partNumber).toBe(15);
  });

  it('cleans interrupted streams and permits an exact retry', async () => {
    const uploadId = await begin();
    const claims = verifyStorageUploadToken(secret, new URL(await store.sign(key, uploadId, 1, 8)).searchParams.get('token')!);
    async function* interrupted() { yield bytes.subarray(0, 3); throw new Error('Disconnected'); }
    await expect(store.receivePart(claims, interrupted())).rejects.toThrow('Disconnected');
    expect(await store.parts(key, uploadId)).toEqual([]);
    expect(await readdir(join(folder, 'staging'))).toEqual([]);
    await put(uploadId, 1, bytes.subarray(0, 8));
  });

  it('detects retained part corruption before publishing an object', async () => {
    const uploadId = await begin(); await upload(uploadId);
    await writeFile(join(folder, 'uploads', uploadId, 'parts', '1', 'data'), Buffer.alloc(8));
    await expect(store.complete(key, uploadId, await store.parts(key, uploadId))).rejects.toThrow(/changed/);
    await expect(store.head(key)).rejects.toMatchObject({ name: 'NotFound' });
  });

  it('purges only exact submission objects and makes old upload grants unusable', async () => {
    const uploadId = await begin(); await upload(uploadId);
    await store.complete(key, uploadId, await store.parts(key, uploadId));
    await expect(store.purge(['wordpress/' + 'a'.repeat(64) + '/' + 'b'.repeat(64)])).rejects.toThrow(/key/);
    await store.purge([key, key]);
    await expect(store.head(key)).rejects.toMatchObject({ name: 'NotFound' });
    await expect(store.parts(key, uploadId)).rejects.toMatchObject({ name: 'NoSuchUpload' });
    await store.purge([key]);
  });

  it('prevents a purged upload from publishing an in-flight part', async () => {
    const uploadId = await begin();
    const claims = verifyStorageUploadToken(secret, new URL(await store.sign(key, uploadId, 1, 8)).searchParams.get('token')!);
    let started!: () => void, resume!: () => void;
    const streaming = new Promise<void>(resolve => { started = resolve; });
    const paused = new Promise<void>(resolve => { resume = resolve; });
    async function* delayed() { yield bytes.subarray(0, 3); started(); await paused; yield bytes.subarray(3, 8); }
    const result = store.receivePart(claims, delayed()).then(() => null, error => error);
    await streaming; await store.purge([key]); resume();
    expect(await result).toBeInstanceOf(Error);
    await expect(store.parts(key, uploadId)).rejects.toMatchObject({ name: 'NoSuchUpload' });
    expect(await readdir(join(folder, 'staging'))).toEqual([]);
  });

  it('rejects symlink storage roots and symlink object files', async () => {
    const target = join(folder, 'target'); await mkdir(target);
    const link = join(folder, 'link'); await symlink(target, link, 'junction');
    const unsafe = new FileSystemStore(link, secret, 'https://summit.example.test');
    await expect(unsafe.begin(key, { expectedSize: bytes.length, checksum: checksum(bytes), partSize: 8 })).rejects.toThrow(/symbolic|symlink/i);
    const uploadId = await begin(); await upload(uploadId); await store.complete(key, uploadId, await store.parts(key, uploadId));
    const data = join(folder, 'objects', checksum(Buffer.from(key)), 'data');
    await rm(data); const external = join(target, 'external'); await writeFile(external, bytes);
    await symlink(process.platform === 'win32' ? target : external, data, process.platform === 'win32' ? 'junction' : 'file');
    await expect(store.read(key)).rejects.toThrow(/symbolic|symlink/i);
  });
});

describe('storage upload capabilities', () => {
  const input = { key, uploadId: '11111111-1111-4111-8111-111111111111', partNumber: 1, contentLength: 8 };
  it('binds strictly scoped claims and expires after five minutes', () => {
    const token = signStorageUploadToken(secret, input, 1000);
    expect(verifyStorageUploadToken(secret, token, 1001)).toMatchObject({ ...input, version: 1, purpose: 'upload-part', issuedAt: 1000, expiresAt: 1300 });
    expect(() => verifyStorageUploadToken(secret, token, 1300)).toThrow();
    expect(() => verifyStorageUploadToken(secret, token + 'x', 1001)).toThrow();
    expect(() => verifyStorageUploadToken(secret + 'other', token, 1001)).toThrow();
    expect(() => verifyStorageUploadToken(secret, token, 900)).toThrow();
    expect(() => signStorageUploadToken(secret, { ...input, key: '../outside' }, 1000)).toThrow();
  });
});
