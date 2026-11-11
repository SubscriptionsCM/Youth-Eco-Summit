import { randomUUID, createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '../src/server/core';
import type { Db } from '../src/server/db';
import { FileSystemStore } from '../src/server/storage/filesystem';
import { portalDownloadUrl, type PortalFile } from '../src/server/storage/downloads';
import { privateStorageAction } from '../src/server/storage/transfer';

const origin = 'https://portal.test';
const secret = 'private-storage-gateway-test-secret-at-least-32';
const digest = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');
let root: string;
let store: FileSystemStore;
let actor: Actor | null;
let active: boolean;
let record: Record<string, any>;
let file: PortalFile & Record<string, any>;
let database: Db;
const content = Buffer.from('private document');

beforeEach(async () => {
  vi.stubEnv('AUTH_SECRET', secret);
  vi.stubEnv('APP_ORIGIN', origin);
  await mkdir(resolve('.local/test-temp'), { recursive: true });
  root = await mkdtemp(resolve('.local/test-temp', 'gateway-'));
  store = new FileSystemStore(root, secret, origin);
  actor = { id: randomUUID(), role: 'participant' };
  active = true;
  record = { id: randomUUID(), owner_id: actor.id, status: 'draft', draft_token_hash: null };
  const fileId = randomUUID();
  file = { id: fileId, record_id: record.id, storage_key: `submissions/${record.id}/${fileId}`, status: 'pending', filename: 'private.pdf',
    mime_type: 'application/pdf', expected_size: content.length, expected_checksum: digest(content), part_size: 16, metadata: {} };
  file.upload_id = await store.begin(file.storage_key, { expectedSize: content.length, checksum: file.expected_checksum, partSize: 16 });
  database = {
    async query(sql, parameters) {
      if (sql.includes('FROM portal_form_files')) return { rows: [file] };
      if (sql.includes('FROM portal_form_records')) return { rows: [record] };
      if (sql.includes('FROM users')) return { rows: active ? [{ id: record.owner_id }] : [] };
      if (sql.includes('FROM assets')) return { rows: [] };
      throw new Error(`Unexpected gateway query ${sql}`);
    },
    transaction: async fn => fn(database),
  } as Db;
});

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  if (dirname(root) !== resolve('.local/test-temp') || !basename(root).startsWith('gateway-')) throw new Error('Unexpected gateway fixture path');
  await rm(root, { recursive: true, force: true });
});

const request = (url: string, options: RequestInit = {}) => new Request(url, { ...options, headers: { Origin: origin, ...options.headers } });
const call = (value: Request) => privateStorageAction(value, database, store, async () => actor);
async function retained() {
  await store.uploadPart(file.storage_key, file.upload_id, 1, content);
  await store.complete(file.storage_key, file.upload_id, await store.parts(file.storage_key, file.upload_id));
  file.status = 'ready';
  file.metadata = { storageVersion: file.expected_checksum, storageEtag: `"${file.expected_checksum}"` };
}

describe('private filesystem transfer gateway', () => {
  it('streams a signed part only while its owner has an editable upload', async () => {
    const url = await store.sign(file.storage_key, file.upload_id, 1, content.length);
    const response = await call(request(url, { method: 'PUT', body: content }));
    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toBe(`"${file.expected_checksum}"`);
    expect(await store.parts(file.storage_key, file.upload_id)).toHaveLength(1);
  });

  it('rejects a different owner and a completed draft before accepting bytes', async () => {
    const url = await store.sign(file.storage_key, file.upload_id, 1, content.length);
    actor = { id: randomUUID(), role: 'participant' };
    expect((await call(request(url, { method: 'PUT', body: content }))).status).toBe(404);
    actor = { id: record.owner_id, role: 'participant' };
    record.status = 'submitted';
    expect((await call(request(url, { method: 'PUT', body: content }))).status).toBe(409);
    expect(await store.parts(file.storage_key, file.upload_id)).toHaveLength(0);
  });

  it('rejects invalid signatures and cross-origin uploads', async () => {
    expect((await call(request(`${origin}/api/private-storage?token=invalid`, { method: 'PUT', body: content }))).status).toBe(403);
    const url = await store.sign(file.storage_key, file.upload_id, 1, content.length);
    expect((await call(request(url, { method: 'PUT', body: content, headers: { Origin: 'https://outside.test' } }))).status).toBe(403);
  });

  it('serves owned GET, HEAD and byte ranges through scoped download URLs', async () => {
    await retained();
    const url = await portalDownloadUrl(database, store, actor, file);
    const response = await call(request(url));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(content.toString());
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('content-disposition')).toContain('attachment');
    const head = await call(request(url, { method: 'HEAD' }));
    expect(head.headers.get('content-length')).toBe(String(content.length));
    expect(await head.text()).toBe('');
    const range = await call(request(url, { headers: { Range: 'bytes=2-6' } }));
    expect(range.status).toBe(206);
    expect(await range.text()).toBe(content.subarray(2, 7).toString());
    const invalid = await call(request(url, { headers: { Range: 'bytes=1000-' } }));
    expect(invalid.status).toBe(416);
  });

  it('rechecks owner, account status, verification status and expiry on download', async () => {
    await retained();
    const url = await portalDownloadUrl(database, store, actor, file);
    const owner = actor;
    actor = { id: randomUUID(), role: 'participant' };
    expect((await call(request(url))).status).toBe(404);
    actor = owner;
    active = false;
    expect([401, 404]).toContain((await call(request(url))).status);
    active = true;
    file.status = 'rejected';
    expect((await call(request(url))).status).toBe(404);
    file.status = 'ready';
    vi.setSystemTime(Date.now() + 61000);
    expect((await call(request(url))).status).toBe(403);
  });

  it('binds anonymous download capabilities to the current private draft', async () => {
    await retained();
    const token = 'private-draft-token-for-this-test';
    record.owner_id = null;
    record.draft_token_hash = digest(token);
    actor = null;
    const url = await portalDownloadUrl(database, store, actor, file, token);
    expect(url).not.toContain(token);
    expect((await call(request(url))).status).toBe(200);
    record.draft_token_hash = digest('different-draft-token');
    expect((await call(request(url))).status).toBe(404);
  });
});
