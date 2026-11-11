import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { isMissing, type ObjectStore, type StorageHead } from '../../src/server/storage/provider';
import { MAX_STORAGE_PART_BYTES } from '../../src/server/storage/tokens';
import type { Attachment, VerifiedAttachment } from '../../src/server/wordpress-migration';

/** An optional local path authorizes a copy. Every result hashes the retained destination. */
export async function retainWordPressAttachment(store: ObjectStore, source: string, file: Attachment, localPath?: string): Promise<VerifiedAttachment> {
  const identity = createHash('sha256').update(source + ':' + file.sourceId).digest('hex');
  const storageKey = `wordpress/${identity}/${file.sha256}`;
  let retained: StorageHead | undefined;
  try { retained = await store.head(storageKey); }
  catch (error) { if (!isMissing(error)) throw error; }
  if (!retained && localPath !== undefined) {
    const handle = await open(localPath, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size !== file.bytes) throw new Error('Attachment source size mismatch.');
      const partSize = MAX_STORAGE_PART_BYTES;
      const uploadId = await store.begin(storageKey, { expectedSize: file.bytes, checksum: file.sha256, partSize });
      for (let offset = 0, number = 1; offset < file.bytes; offset += partSize, number++) {
        const length = Math.min(partSize, file.bytes - offset), bytes = Buffer.alloc(length);
        let read = 0;
        while (read < length) {
          const result = await handle.read(bytes, read, length - read, offset + read);
          if (!result.bytesRead) throw new Error('Attachment source changed during transfer.');
          read += result.bytesRead;
        }
        await store.uploadPart(storageKey, uploadId, number, bytes);
      }
      await store.complete(storageKey, uploadId, await store.parts(storageKey, uploadId));
    } finally { await handle.close(); }
    retained = await store.head(storageKey);
  }
  if (!retained || retained.ContentLength !== file.bytes || !(retained.VersionId || retained.ETag)) throw new Error('Private attachment size or retained identity could not be verified.');
  const object = await store.read(storageKey, retained.VersionId, retained.ETag);
  if (!object.Body) throw new Error('Private attachment could not be read back.');
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of object.Body) {
    bytes += chunk.byteLength;
    if (bytes > file.bytes) throw new Error('Private attachment is larger than its manifest.');
    hash.update(chunk);
  }
  const sha256 = hash.digest('hex');
  if (bytes !== file.bytes) throw new Error('Private attachment size mismatch.');
  if (sha256 !== file.sha256) throw new Error('Private attachment SHA256 mismatch.');
  return { storageKey, sha256, bytes };
}
