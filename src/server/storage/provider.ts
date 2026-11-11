import { S3Client, CreateMultipartUploadCommand, UploadPartCommand, ListPartsCommand, CompleteMultipartUploadCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectsCommand, ListObjectVersionsCommand, ListMultipartUploadsCommand, AbortMultipartUploadCommand, type Part } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppError } from '../core';
import { FileSystemStore } from './filesystem';

export type MultipartDeclaration = { expectedSize: number; checksum: string; partSize: number };
export type StorageHead = { ContentLength?: number; ETag?: string; VersionId?: string };
export type StorageRead = StorageHead & { Body?: AsyncIterable<Uint8Array> };
export interface ObjectStore {
  begin(key: string, declaration?: MultipartDeclaration): Promise<string>;
  sign(key: string, uploadId: string, partNumber: number, contentLength: number): Promise<string>;
  uploadPart(key: string, uploadId: string, partNumber: number, body: Uint8Array): Promise<unknown>;
  parts(key: string, uploadId: string): Promise<Part[]>;
  complete(key: string, uploadId: string, parts: Part[]): Promise<unknown>;
  head(key: string, version?: string): Promise<StorageHead>;
  read(key: string, version?: string, etag?: string, range?: string): Promise<StorageRead>;
  purge(keys: string[]): Promise<void>;
}

export class S3Store implements ObjectStore {
  constructor(readonly client: S3Client, readonly bucket: string) {}
  async begin(key: string, _declaration?: MultipartDeclaration) {
    const result = await this.client.send(new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key, ContentType: 'application/octet-stream' }));
    if (!result.UploadId) throw new Error('Storage did not create an upload');
    return result.UploadId;
  }
  async sign(key: string, uploadId: string, partNumber: number, contentLength: number) {
    return getSignedUrl(this.client, new UploadPartCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId, PartNumber: partNumber, ContentLength: contentLength }), { expiresIn: 300 });
  }
  async uploadPart(key: string, uploadId: string, partNumber: number, body: Uint8Array) {
    return this.client.send(new UploadPartCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId, PartNumber: partNumber, ContentLength: body.byteLength, Body: body }));
  }
  async parts(key: string, uploadId: string) {
    const parts: Part[] = [];
    let marker: string | undefined;
    do {
      const page = await this.client.send(new ListPartsCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId, PartNumberMarker: marker }));
      parts.push(...page.Parts ?? []);
      if (page.IsTruncated && (!page.NextPartNumberMarker || page.NextPartNumberMarker === marker)) throw new Error('Storage returned invalid part pagination');
      marker = page.IsTruncated ? page.NextPartNumberMarker : undefined;
    } while (marker);
    return parts.sort((a, b) => a.PartNumber! - b.PartNumber!);
  }
  async complete(key: string, uploadId: string, parts: Part[]) {
    return this.client.send(new CompleteMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId, MultipartUpload: { Parts: parts.map(p => ({ PartNumber: p.PartNumber, ETag: p.ETag })) } }));
  }
  async head(key: string, version?: string) { return this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key, VersionId: version })); }
  async read(key: string, version?: string, etag?: string, range?: string): Promise<StorageRead> {
    // This provider executes in Node, where the SDK returns an iterable stream.
    return this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key, VersionId: version, IfMatch: etag, Range: range })) as Promise<StorageRead>;
  }
  async purge(keys: string[]) {
    for (const key of new Set(keys)) {
      // Generated asset keys are never a user filename or a broad prefix.
      if (!/^submissions\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/.test(key)) throw new Error('Refusing to purge an invalid storage key');
      // Abort resumable uploads first, including ones created before a DB transaction failed.
      let keyMarker: string | undefined, uploadMarker: string | undefined;
      do {
        const page = await this.client.send(new ListMultipartUploadsCommand({ Bucket: this.bucket, Prefix: key, KeyMarker: keyMarker, UploadIdMarker: uploadMarker }));
        for (const upload of page.Uploads ?? []) if (upload.Key === key && upload.UploadId) await this.client.send(new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: upload.UploadId }));
        if (page.IsTruncated && (!page.NextKeyMarker || (page.NextKeyMarker === keyMarker && page.NextUploadIdMarker === uploadMarker))) throw new Error('Storage returned invalid upload pagination');
        keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined; uploadMarker = page.NextUploadIdMarker;
      } while (keyMarker);
      // Repeat from the first page after deletion so no continuation token references a deleted version.
      let batches = 0;
      while (true) {
        const page = await this.client.send(new ListObjectVersionsCommand({ Bucket: this.bucket, Prefix: key, MaxKeys: 1000 }));
        const versions = [...page.Versions ?? [], ...page.DeleteMarkers ?? []].filter(v => v.Key === key);
        if (!versions.length) {
          if (page.IsTruncated) throw new Error('Cannot establish that every object version was deleted');
          break;
        }
        if (++batches > 10000) throw new Error('Object versions remain after deletion attempts');
        const result = await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: versions.map(v => ({ Key: key, VersionId: v.VersionId })), Quiet: true } }));
        if (result.Errors?.length) throw new Error(`Storage refused deletion: ${result.Errors.map(e => e.Code).join(', ')}`);
      }
      try { await this.head(key); throw new Error('Object remains accessible after purge'); }
      catch (error) { if (!isMissing(error)) throw error; }
    }
  }
}

export function isMissing(error: unknown): boolean {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === 'NoSuchKey' || e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404;
}

export function objectStore(): ObjectStore {
  if (process.env.STORAGE_PROVIDER === 'filesystem') {
    const root = process.env.STORAGE_LOCAL_ROOT, secret = process.env.AUTH_SECRET, origin = process.env.APP_ORIGIN;
    if (!root || !secret || !origin) throw new AppError(503, 'Private filesystem storage requires STORAGE_LOCAL_ROOT, AUTH_SECRET and APP_ORIGIN.');
    return new FileSystemStore(root, secret, origin);
  }
  const bucket = process.env.S3_BUCKET;
  const region = process.env.S3_REGION;
  if (!bucket || !region) throw new AppError(503, 'Private storage is not configured. Set S3_BUCKET and S3_REGION before opening uploads.');
  return new S3Store(new S3Client({ region, endpoint: process.env.S3_ENDPOINT || undefined, forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true', requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' }), bucket);
}
