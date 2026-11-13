import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, lstat, mkdir, mkdtemp, open, readdir, realpath, rename, rm, rmdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse, relative, resolve } from 'node:path';
import type { Part } from '@aws-sdk/client-s3';
import { AppError } from '../core';
import type { MultipartDeclaration, ObjectStore, StorageHead, StorageRead } from './provider';
import { parseRange } from './validation';
import { MAX_STORAGE_OBJECT_BYTES, MAX_STORAGE_PART_BYTES, signStorageUploadToken, storageKeySchema, type StorageUploadClaims } from './tokens';

type UploadManifest = MultipartDeclaration & { version: 1; key: string; uploadId: string };
type FileManifest = { version: 1; key: string; size: number; checksum: string };
const checksumPattern = /^[a-f0-9]{64}$/;
const uploadIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const code = (error: unknown) => (error as NodeJS.ErrnoException).code;
const absent = (name: 'NotFound' | 'NoSuchUpload') => Object.assign(new Error('Private storage data is unavailable.'), { name, $metadata: { httpStatusCode: 404 } });

/** Private, immutable objects. Domain authorization belongs to the application gateway. */
export class FileSystemStore implements ObjectStore {
  readonly root: string;
  private initialized?: Promise<void>;
  private readonly origin: string;

  constructor(root: string, private readonly secret: string, origin: string) {
    if (!isAbsolute(root)) throw new AppError(503, 'Private storage requires an absolute filesystem root.');
    this.root = resolve(root);
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new AppError(503, 'Private storage requires a valid application origin.');
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new AppError(503, 'Private storage requires HTTPS.');
    if (Buffer.byteLength(secret) < 32) throw new AppError(503, 'Private storage requires a signing secret of at least 32 bytes.');
    this.origin = url.origin;
  }

  private validateKey(key: string) {
    if (!storageKeySchema.safeParse(key).success) throw new AppError(400, 'Invalid private storage key.');
  }

  private path(...segments: string[]) {
    const path = resolve(this.root, ...segments), within = relative(this.root, path);
    if (!within || within.startsWith('..') || isAbsolute(within)) throw new Error('Private storage path escaped its root.');
    return path;
  }

  private async checkedDirectory(path: string, create = false) {
    const absolute = resolve(path), base = parse(absolute).root;
    let current = base;
    for (const segment of absolute.slice(base.length).split(/[\\/]/).filter(Boolean)) {
      current = join(current, segment);
      if (create) {
        try { await mkdir(current, { mode: 0o700 }); }
        catch (error) { if (code(error) !== 'EEXIST') throw error; }
      }
      const info = await lstat(current);
      if (info.isSymbolicLink()) throw new Error('Private storage refuses symbolic links.');
      if (!info.isDirectory()) throw new Error('Private storage path is not a directory.');
    }
    return absolute;
  }

  private async ready() {
    this.initialized ??= (async () => {
      await this.checkedDirectory(this.root, true);
      const canonical = await realpath(this.root);
      if (resolve(canonical).toLowerCase() !== this.root.toLowerCase()) throw new Error('Private storage root resolves through a symbolic link.');
      if (process.platform !== 'win32') await chmod(this.root, 0o700);
      for (const name of ['objects', 'uploads', 'staging', 'purged']) await this.checkedDirectory(this.path(name), true);
    })();
    await this.initialized;
  }

  private async openRegular(path: string) {
    await this.checkedDirectory(dirname(path));
    const before = await lstat(path);
    if (before.isSymbolicLink()) throw new Error('Private storage refuses symbolic links.');
    if (!before.isFile()) throw new Error('Private storage requires a regular file.');
    const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      const after = await handle.stat();
      if (!after.isFile() || before.dev !== after.dev || before.ino !== after.ino) throw new Error('Private storage file changed while opening.');
      return handle;
    } catch (error) { await handle.close(); throw error; }
  }

  private async json(path: string): Promise<Record<string, unknown>> {
    const handle = await this.openRegular(path);
    try {
      if ((await handle.stat()).size > 8192) throw new Error('Private storage manifest exceeds its limit.');
      const value: unknown = JSON.parse(await handle.readFile('utf8'));
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid private storage manifest.');
      return value as Record<string, unknown>;
    } finally { await handle.close(); }
  }

  private async writeManifest(directory: string, manifest: object) {
    const handle = await open(join(directory, 'manifest.json'), 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify(manifest)); await handle.sync(); }
    finally { await handle.close(); }
  }

  private async syncDirectory(path: string) {
    if (process.platform === 'win32') return;
    const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try { await handle.sync(); } finally { await handle.close(); }
  }

  private async isPurged(key: string) {
    try { await this.checkedDirectory(this.path('purged', sha256(key))); return true; }
    catch (error) { if (code(error) === 'ENOENT') return false; throw error; }
  }

  private declaration(value: MultipartDeclaration | undefined): MultipartDeclaration {
    if (!value) throw new AppError(400, 'A multipart declaration is required.');
    if (!Number.isSafeInteger(value.expectedSize) || value.expectedSize < 1 || value.expectedSize > MAX_STORAGE_OBJECT_BYTES) throw new AppError(413, 'Private file size exceeds the storage limit.');
    if (!Number.isSafeInteger(value.partSize) || value.partSize < 1 || value.partSize > MAX_STORAGE_PART_BYTES || Math.ceil(value.expectedSize / value.partSize) > 10000) throw new AppError(400, 'Invalid private upload part size.');
    if (typeof value.checksum !== 'string' || !checksumPattern.test(value.checksum)) throw new AppError(400, 'A full SHA256 checksum is required.');
    return { expectedSize: value.expectedSize, checksum: value.checksum, partSize: value.partSize };
  }

  private async upload(key: string, uploadId: string): Promise<UploadManifest> {
    this.validateKey(key); await this.ready();
    if (!uploadIdPattern.test(uploadId) || await this.isPurged(key)) throw absent('NoSuchUpload');
    let manifest;
    try { manifest = await this.json(this.path('uploads', uploadId, 'manifest.json')); }
    catch (error) { if (code(error) === 'ENOENT') throw absent('NoSuchUpload'); throw error; }
    if (manifest.version !== 1 || manifest.key !== key || manifest.uploadId !== uploadId) throw new Error('Private multipart upload identity does not match.');
    const declaration = this.declaration(manifest as unknown as MultipartDeclaration);
    return { version: 1, key, uploadId, ...declaration };
  }

  private partLength(upload: UploadManifest, partNumber: number, contentLength?: number) {
    const count = Math.ceil(upload.expectedSize / upload.partSize);
    if (!Number.isSafeInteger(partNumber) || partNumber < 1 || partNumber > count) throw new AppError(400, 'Invalid private upload part number.');
    const length = Math.min(upload.partSize, upload.expectedSize - (partNumber - 1) * upload.partSize);
    if (contentLength !== undefined && contentLength !== length) throw new AppError(422, 'Private upload part length does not match.');
    return length;
  }

  /** Operator-only historical import; native submissions must use verified uploads. */
  async importArchive(key: string, body: AsyncIterable<Uint8Array>, expected: {expectedSize:number;checksum:string}):Promise<StorageHead> {
    if (!/^wordpress\/[a-f0-9]{64}\/[a-f0-9]{64}$/.test(key)) throw new AppError(400,'Choose a historical archive key.');
    this.validateKey(key);
    const declaration=this.declaration({...expected,partSize:MAX_STORAGE_PART_BYTES});
    if (!key.endsWith('/'+declaration.checksum)) throw new AppError(422,'Archive key and checksum differ.');
    await this.ready();
    const retained=await this.stage(this.path('objects',sha256(key)),key,body,declaration.expectedSize,declaration.checksum);
    return {ContentLength:retained.size,ETag:`"${retained.checksum}"`,VersionId:retained.checksum};
  }

  async begin(key: string, input?: MultipartDeclaration) {
    this.validateKey(key); const declaration = this.declaration(input); await this.ready();
    if (await this.isPurged(key)) throw new AppError(409, 'This private object has been permanently removed.');
    const uploadId = randomUUID(), directory = this.path('uploads', uploadId);
    await this.checkedDirectory(directory, true);
    await this.checkedDirectory(join(directory, 'parts'), true);
    await this.writeManifest(directory, { version: 1, key, uploadId, ...declaration });
    await this.syncDirectory(directory);
    await this.syncDirectory(this.path('uploads'));
    return uploadId;
  }

  async sign(key: string, uploadId: string, partNumber: number, contentLength: number) {
    this.partLength(await this.upload(key, uploadId), partNumber, contentLength);
    const url = new URL('/api/private-storage', this.origin);
    url.searchParams.set('token', signStorageUploadToken(this.secret, { key, uploadId, partNumber, contentLength }));
    return url.toString();
  }

  /** Call only after verifying the capability and current domain authorization. */
  async receivePart(claims: StorageUploadClaims, body: AsyncIterable<Uint8Array>, contentLength?: number) {
    const upload = await this.upload(claims.key, claims.uploadId);
    const length = this.partLength(upload, claims.partNumber, claims.contentLength);
    if (contentLength !== undefined && contentLength !== length) throw new AppError(422, 'Private upload part length does not match.');
    const target = this.path('uploads', upload.uploadId, 'parts', String(claims.partNumber));
    const manifest = await this.stage(target, upload.key, body, length);
    if (await this.isPurged(upload.key)) { await this.remove(target); throw absent('NoSuchUpload'); }
    return { ETag: `"${manifest.checksum}"` };
  }

  async uploadPart(key: string, uploadId: string, partNumber: number, body: Uint8Array) {
    const upload = await this.upload(key, uploadId);
    const contentLength = this.partLength(upload, partNumber, body.byteLength);
    async function* chunks() { yield body; }
    return this.receivePart({ version: 1, purpose: 'upload-part', key, uploadId, partNumber, contentLength, issuedAt: 0, expiresAt: 0 }, chunks(), contentLength);
  }

  private async fileManifest(directory: string, key: string): Promise<FileManifest> {
    const manifest = await this.json(join(directory, 'manifest.json'));
    if (manifest.version !== 1 || manifest.key !== key || !Number.isSafeInteger(manifest.size) || Number(manifest.size) < 1 || Number(manifest.size) > MAX_STORAGE_OBJECT_BYTES || typeof manifest.checksum !== 'string' || !checksumPattern.test(manifest.checksum)) throw new Error('Invalid private file manifest.');
    const handle = await this.openRegular(join(directory, 'data'));
    try { if ((await handle.stat()).size !== manifest.size) throw new Error('Private file size does not match its manifest.'); }
    finally { await handle.close(); }
    return manifest as FileManifest;
  }

  private async stage(target: string, key: string, body: AsyncIterable<Uint8Array>, length: number, expectedChecksum?: string) {
    await this.checkedDirectory(this.path('staging'));
    const directory = await mkdtemp(this.path('staging', 'write-'));
    let published = false;
    try {
      const hash = createHash('sha256'), handle = await open(join(directory, 'data'), 'wx', 0o600);
      let size = 0;
      try {
        for await (const chunk of body) {
          if (!(chunk instanceof Uint8Array)) throw new AppError(400, 'Private uploads require binary data.');
          size += chunk.byteLength;
          if (size > length) throw new AppError(413, 'Private upload exceeds its exact byte limit.');
          hash.update(chunk); await handle.writeFile(chunk);
        }
        if (size !== length) throw new AppError(422, 'Private upload ended before every byte arrived.');
        await handle.sync();
      } finally { await handle.close(); }
      const checksum = hash.digest('hex');
      if (expectedChecksum && checksum !== expectedChecksum) throw new AppError(422, 'Private file checksum does not match the original.');
      const manifest: FileManifest = { version: 1, key, size, checksum };
      await this.writeManifest(directory, manifest); await this.syncDirectory(directory);
      await this.checkedDirectory(dirname(target));
      try { await rename(directory, target); published = true; await this.syncDirectory(dirname(target)); }
      catch (error) {
        if (!['EEXIST', 'ENOTEMPTY', 'EPERM'].includes(code(error) || '')) throw error;
        const existing = await this.fileManifest(target, key);
        if (existing.size !== size || existing.checksum !== checksum) throw new AppError(409, 'Different bytes are already retained in this private upload.');
        // Read the winner so identical retries cannot conceal disk corruption.
        const retained = await this.hashFile(join(target, 'data'));
        if (retained !== checksum) throw new Error('Retained private file checksum does not match.');
      }
      return manifest;
    } finally { if (!published) await this.remove(directory); }
  }

  private async hashFile(path: string) {
    const handle = await this.openRegular(path), hash = createHash('sha256');
    try { for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk); return hash.digest('hex'); }
    finally { await handle.close(); }
  }

  async parts(key: string, uploadId: string): Promise<Part[]> {
    const upload = await this.upload(key, uploadId), directory = this.path('uploads', uploadId, 'parts');
    await this.checkedDirectory(directory);
    const parts: Part[] = [];
    for (const name of await readdir(directory)) {
      if (!/^[1-9][0-9]{0,4}$/.test(name)) throw new Error('Invalid private upload part directory.');
      const number = Number(name), manifest = await this.fileManifest(join(directory, name), key);
      if (manifest.size !== this.partLength(upload, number)) throw new Error('Retained private upload part has an invalid size.');
      parts.push({ PartNumber: number, Size: manifest.size, ETag: `"${manifest.checksum}"` });
    }
    return parts.sort((a, b) => a.PartNumber! - b.PartNumber!);
  }

  async complete(key: string, uploadId: string, requestedParts: Part[]) {
    const upload = await this.upload(key, uploadId), parts = await this.parts(key, uploadId);
    const count = Math.ceil(upload.expectedSize / upload.partSize);
    if (parts.length !== count || requestedParts.length !== count || parts.some((part, index) => part.PartNumber !== index + 1 || requestedParts[index]?.PartNumber !== part.PartNumber || requestedParts[index]?.ETag !== part.ETag)) throw new AppError(409, 'Upload every exact private file part before completing.');
    const store = this;
    async function* assembled() {
      for (const part of parts) {
        const handle = await store.openRegular(store.path('uploads', uploadId, 'parts', String(part.PartNumber), 'data'));
        const hash = createHash('sha256'); let size = 0;
        try {
          for await (const chunk of handle.createReadStream({ autoClose: false })) { size += chunk.length; hash.update(chunk); yield chunk as Uint8Array; }
          if (size !== part.Size || `"${hash.digest('hex')}"` !== part.ETag) throw new Error('Private upload part changed during completion.');
        } finally { await handle.close(); }
      }
    }
    const target = this.path('objects', sha256(key));
    const manifest = await this.stage(target, key, assembled(), upload.expectedSize, upload.checksum);
    if (await this.isPurged(key)) { await this.remove(target); throw absent('NotFound'); }
    return { ETag: `"${manifest.checksum}"`, VersionId: manifest.checksum };
  }

  private async object(key: string, version?: string, etag?: string) {
    this.validateKey(key); await this.ready();
    if (await this.isPurged(key)) throw absent('NotFound');
    const directory = this.path('objects', sha256(key));
    let manifest;
    try { manifest = await this.fileManifest(directory, key); }
    catch (error) { if (code(error) === 'ENOENT') throw absent('NotFound'); throw error; }
    if ((version !== undefined && version !== manifest.checksum) || (etag !== undefined && etag !== `"${manifest.checksum}"`)) throw new AppError(412, 'Private file identity does not match the verified object.');
    return { directory, manifest };
  }

  async head(key: string, version?: string): Promise<StorageHead> {
    const { manifest } = await this.object(key, version);
    return { ContentLength: manifest.size, ETag: `"${manifest.checksum}"`, VersionId: manifest.checksum };
  }

  async read(key: string, version?: string, etag?: string, range?: string): Promise<StorageRead> {
    const { directory, manifest } = await this.object(key, version, etag);
    let bounds;
    if (range) {
      try { bounds = parseRange(range, manifest.size); }
      catch { throw new AppError(416, 'The requested private file range is unavailable.'); }
    }
    const handle = await this.openRegular(join(directory, 'data'));
    try {
      if ((await handle.stat()).size !== manifest.size) throw new Error('Private file changed while opening.');
      const Body = handle.createReadStream({ autoClose: true, ...bounds });
      return { Body, ContentLength: bounds ? bounds.end - bounds.start + 1 : manifest.size, ETag: `"${manifest.checksum}"`, VersionId: manifest.checksum };
    } catch (error) { await handle.close(); throw error; }
  }

  private async remove(path: string) {
    const within = relative(this.root, path);
    if (!within || within.startsWith('..') || isAbsolute(within)) throw new Error('Refusing unsafe private storage deletion.');
    try {
      const info = await lstat(path);
      if (info.isSymbolicLink()) throw new Error('Private storage refuses symbolic links.');
      if (info.isDirectory()) {
        for (const name of await readdir(path)) await this.remove(join(path, name));
        await rmdir(path);
      } else await rm(path, { force: true });
    } catch (error) { if (code(error) !== 'ENOENT') throw error; }
  }

  async purge(keys: string[]) {
    for (const key of keys) { this.validateKey(key); if (!key.startsWith('submissions/')) throw new AppError(400, 'Refusing to purge an invalid storage key.'); }
    await this.ready();
    for (const key of new Set(keys)) {
      // Permanent tombstones prevent in-flight uploads from resurrecting a purged key.
      await this.checkedDirectory(this.path('purged', sha256(key)), true);
      await this.syncDirectory(this.path('purged'));
      await this.remove(this.path('objects', sha256(key)));
      for (const uploadId of await readdir(this.path('uploads'))) {
        if (!uploadIdPattern.test(uploadId)) throw new Error('Invalid private multipart upload directory.');
        const directory = this.path('uploads', uploadId);
        let manifest;
        try { manifest = await this.json(join(directory, 'manifest.json')); }
        catch (error) { if (code(error) === 'ENOENT') continue; throw error; }
        if (manifest.key === key) await this.remove(directory);
      }
      await this.syncDirectory(this.path('objects')); await this.syncDirectory(this.path('uploads'));
    }
  }
}
