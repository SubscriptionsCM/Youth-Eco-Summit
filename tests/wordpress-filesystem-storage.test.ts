import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { FileSystemStore } from '../src/server/storage/filesystem';
import { retainWordPressAttachment, retainWordPressFilesystemAttachment } from '../scripts/lib/wordpress-storage';
import type { Attachment } from '../src/server/wordpress-migration';
import { archiveWordPress, verifyWordPressArchive } from '../src/server/wordpress-migration';
import { testDb } from './helpers/db';

const source = 'https://youthecosummit.com';
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
describe('WordPress attachment retention on private filesystem storage', () => {
  let folder: string, store: FileSystemStore, path: string, file: Attachment;
  const bytes = Buffer.alloc(8 * 1024 ** 2 + 17, 97);
  beforeEach(async () => {
    const parent = resolve('.local/test-temp'); await mkdir(parent, { recursive: true });
    folder = await mkdtemp(join(parent, 'wordpress-storage-'));
    path = join(folder, 'source.pdf'); await writeFile(path, bytes);
    store = new FileSystemStore(join(folder, 'private'), 'migration-test-signing-secret-with-at-least-32-bytes', 'https://summit.example.test');
    file = { sourceId: 'entry-1:file-2', entryId: 'entry-1', path: 'source.pdf', sha256: hash(bytes), bytes: bytes.length, filename: 'source.pdf', mimeType: 'application/pdf' };
  });
  afterEach(async () => { if (folder) await rm(folder, { recursive: true, force: true }); });

  it('streams a historical archive without retaining multipart copies', async () => {
    const expected = {storageKey:`wordpress/${hash(source+':'+file.sourceId)}/${file.sha256}`,sha256:file.sha256,bytes:file.bytes};
    expect(await retainWordPressFilesystemAttachment(store,source,file,path)).toEqual(expected);
    expect(await readdir(join(folder,'private','uploads'))).toEqual([]);
    expect(await retainWordPressFilesystemAttachment(store,source,file,join(folder,'missing'))).toEqual(expected);
    expect((await readFile(path)).equals(bytes)).toBe(true);
  });

  it('rejects changed archive sources and detects corrupt retained archive bytes', async () => {
    await writeFile(path,Buffer.alloc(bytes.length,98));
    await expect(retainWordPressFilesystemAttachment(store,source,file,path)).rejects.toThrow(/checksum/);
    await writeFile(path,bytes);
    const saved=await retainWordPressFilesystemAttachment(store,source,file,path);
    const destination=join(folder,'private','objects',hash(saved.storageKey),'data');
    await writeFile(destination,Buffer.alloc(bytes.length,98));
    await expect(retainWordPressFilesystemAttachment(store,source,file)).rejects.toThrow(/SHA256/);
  });

  it('does not allow the archive import to bypass native submission upload controls', async () => {
    const native='submissions/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222';
    async function* body(){yield bytes;}
    await expect(store.importArchive(native,body(),{expectedSize:bytes.length,checksum:file.sha256})).rejects.toThrow(/archive/);
  });

  it('copies bounded multipart bytes and independently verifies the exact retained destination', async () => {
    const expected = { storageKey: `wordpress/${hash(source + ':' + file.sourceId)}/${file.sha256}`, sha256: file.sha256, bytes: file.bytes };
    expect(await retainWordPressAttachment(store, source, file, path)).toEqual(expected);
    expect(await retainWordPressAttachment(store, source, file)).toEqual(expected);
    expect((await readFile(path)).equals(bytes)).toBe(true);
    const uploadIds = await readdir(join(folder, 'private', 'uploads'));
    expect(uploadIds).toHaveLength(1);
    expect(await readdir(join(folder, 'private', 'uploads', uploadIds[0], 'parts'))).toHaveLength(2);
  });

  it('accepts a duplicate only after readback and keeps its existing object and upload state', async () => {
    const first = await retainWordPressAttachment(store, source, file, path);
    expect(await retainWordPressAttachment(store, source, file, join(folder, 'missing-source'))).toEqual(first);
    expect(await readdir(join(folder, 'private', 'uploads'))).toHaveLength(1);
    expect((await readFile(path)).equals(bytes)).toBe(true);
  });

  it('rejects corrupt retained bytes even when size and stored identity still match', async () => {
    const retained = await retainWordPressAttachment(store, source, file, path);
    const destination = join(folder, 'private', 'objects', hash(retained.storageKey), 'data');
    await writeFile(destination, Buffer.alloc(bytes.length, 98));
    await expect(retainWordPressAttachment(store, source, file)).rejects.toThrow(/SHA256/);
    await expect(retainWordPressAttachment(store, source, file, path)).rejects.toThrow(/SHA256/);
    expect(hash(await readFile(destination))).toBe(hash(Buffer.alloc(bytes.length, 98)));
    expect(await readdir(join(folder, 'private', 'uploads'))).toHaveLength(1);
  });

  it('never copies missing destinations during verification and rejects changed sources', async () => {
    await expect(retainWordPressAttachment(store, source, file)).rejects.toThrow();
    await writeFile(path, Buffer.alloc(bytes.length, 98));
    await expect(retainWordPressAttachment(store, source, file, path)).rejects.toThrow(/checksum/);
    const storageKey = `wordpress/${hash(source + ':' + file.sourceId)}/${file.sha256}`;
    await expect(store.head(storageKey)).rejects.toMatchObject({ name: 'NotFound' });
  });

  it('commits attachment metadata once and preserves it during verified retries', async () => {
    const fixture = await testDb();
    try {
      const data = { format: 'yes-wordpress-export/v1', source, capturedAt: '2026-11-04T10:00:00Z', counts: { records: 1, attachments: 1 }, records: [{ kind: 'entry', sourceId: file.entryId, payload: { raw: 'retained original record' } }], attachments: [file] };
      const adapter = (attachment: Attachment) => retainWordPressAttachment(store, source, attachment, path);
      await archiveWordPress(fixture.db, data, { commit: true, verifyAttachment: adapter });
      const original = (await fixture.db.query('SELECT * FROM wordpress_attachments')).rows;
      expect(original).toHaveLength(1);
      expect((await archiveWordPress(fixture.db, data, { commit: true, verifyAttachment: adapter })).inserted).toBe(0);
      expect((await fixture.db.query('SELECT * FROM wordpress_attachments')).rows).toEqual(original);
      expect((await verifyWordPressArchive(fixture.db, data, attachment => retainWordPressAttachment(store, source, attachment))).ok).toBe(true);
      expect(await readdir(join(folder, 'private', 'uploads'))).toHaveLength(1);
    } finally { await fixture.close(); }
  });
});
