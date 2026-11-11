import { Readable } from 'node:stream';
import { AppError } from '../core';
import { ContentRejected } from './validation';
import { scanLocalContent } from './local-scanner';

export async function scanContent(body: AsyncIterable<Uint8Array>, metadata: { checksum: string; mimeType: string; byteSize: number }, maxDuration?: number) {
  if (process.env.STORAGE_DEV_SKIP_SCAN === 'true' && process.env.NODE_ENV !== 'production' && process.env.APP_ENV === 'development') return { status: 'dev_bypass', detail: { warning: 'Development-only scan bypass' } };
  if (process.env.FILE_SCAN_COMMAND) return scanLocalContent(body, metadata, { command: process.env.FILE_SCAN_COMMAND, database: process.env.FILE_SCAN_DATABASE || undefined, timeoutMs: Number(process.env.FILE_SCAN_TIMEOUT_MS || 600000) }, maxDuration);
  const endpoint = process.env.FILE_SCAN_URL;
  if (!endpoint) throw new AppError(503, 'File verification service is not configured');
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' && !(process.env.APP_ENV === 'development' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('Scanner endpoint must use HTTPS');
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Content-SHA256': metadata.checksum, 'X-Content-Type': metadata.mimeType, 'Content-Length': String(metadata.byteSize), ...(process.env.FILE_SCAN_TOKEN ? { Authorization: `Bearer ${process.env.FILE_SCAN_TOKEN}` } : {}) }, body: Readable.toWeb(Readable.from(body)) as ReadableStream<Uint8Array>, duplex: 'half', redirect: 'error', signal: AbortSignal.timeout(Number(process.env.FILE_SCAN_TIMEOUT_MS || 600000)) } as RequestInit & { duplex: string });
  if (!response.ok) throw new Error(`Verification service unavailable (${response.status})`);
  const result = await response.json() as { clean?: boolean; sha256?: string; durationSeconds?: number; engine?: string };
  if (result.clean === false) throw new ContentRejected('The file failed security screening');
  if (result.clean !== true || result.sha256 !== metadata.checksum) throw new Error('Verification service returned an unverified result');
  if (maxDuration !== undefined && metadata.mimeType.startsWith('video/')) {
    if (typeof result.durationSeconds !== 'number' || !Number.isFinite(result.durationSeconds) || result.durationSeconds <= 0) throw new Error('Verification service did not verify video duration');
    if (result.durationSeconds > maxDuration) throw new ContentRejected('Video exceeds the permitted duration');
  }
  return { status: 'clean', detail: { engine: result.engine, durationSeconds: result.durationSeconds, checkedAt: new Date().toISOString() } };
}
