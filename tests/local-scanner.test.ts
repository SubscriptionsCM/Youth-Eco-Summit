import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { scanLocalContent, type LocalScannerDependencies } from '../src/server/storage/local-scanner';
import { ContentRejected } from '../src/server/storage/validation';
import { scanContent } from '../src/server/storage/scanner';
import * as localScanner from '../src/server/storage/local-scanner';

const bytes = Buffer.from('%PDF-1.7\n original uploaded document');
const metadata = { checksum: createHash('sha256').update(bytes).digest('hex'), byteSize: bytes.length, mimeType: 'application/pdf' };
async function* stream(body = bytes) { for (let offset = 0; offset < body.length; offset += 3) yield body.subarray(offset, offset + 3); }

describe('private local malware scanning', () => {
  let folder: string;
  beforeEach(async () => {
    const parent = resolve('.local/test-temp'); await mkdir(parent, { recursive: true });
    folder = await mkdtemp(join(parent, 'scanner-'));
  });
  afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); if (folder) await rm(folder, { recursive: true, force: true }); });
  const clean: LocalScannerDependencies = { run: async () => 0 };
  const config = () => ({ command: process.execPath, timeoutMs: 600000, tempDirectory: folder });

  it('hashes exact private bytes and invokes a bounded command without a shell', async () => {
    let scanned = false;
    const result = await scanLocalContent(stream(), metadata, { ...config(), database: resolve('private-signatures') }, undefined, { run: async (command, args, options) => {
      scanned = true;
      expect(command).toBe(process.execPath);
      expect(args).toEqual(expect.arrayContaining(['--max-filesize=512M', '--max-scansize=1024M', '--max-files=10000', '--max-recursion=32', '--alert-exceeds-max=yes', '--fail-if-cvd-older-than=7', `--database=${resolve('private-signatures')}`]));
      expect(options).toMatchObject({ shell: false, windowsHide: true, timeout: 600000 });
      const path = args[args.length - 1];
      expect(args).toContain(`--tempdir=${dirname(path)}`);
      expect((await readFile(path)).equals(bytes)).toBe(true);
      if (process.platform !== 'win32') {
        expect((await stat(path)).mode & 0o777).toBe(0o600);
        expect((await stat(dirname(path))).mode & 0o777).toBe(0o700);
      }
      return 0;
    } });
    expect(scanned).toBe(true);
    expect(result).toMatchObject({ status: 'clean', detail: { engine: 'ClamAV' } });
    expect(await readdir(folder)).toEqual([]);
  });

  it('rejects infected files and hides provider errors for retryable failures', async () => {
    await expect(scanLocalContent(stream(), metadata, config(), undefined, { run: async () => 1 })).rejects.toBeInstanceOf(ContentRejected);
    await expect(scanLocalContent(stream(), metadata, config(), undefined, { run: async () => 2 })).rejects.toMatchObject({ status: 503 });
    let failure: unknown;
    try { await scanLocalContent(stream(), metadata, config(), undefined, { run: async () => { throw new Error('private/provider/path and stderr'); } }); }
    catch (error) { failure = error; }
    expect(failure).toMatchObject({ status: 503 });
    expect((failure as Error).message).not.toMatch(/private\/provider|stderr/);
    expect(await readdir(folder)).toEqual([]);
  });

  it('fails with a retryable error when the scanner refuses stale signature databases', async () => {
    const staleDatabase: LocalScannerDependencies = { run: async (_command, args) => args.includes('--fail-if-cvd-older-than=7') ? 2 : 0 };
    await expect(scanLocalContent(stream(), metadata, config(), undefined, staleDatabase)).rejects.toMatchObject({ status: 503 });
    expect(await readdir(folder)).toEqual([]);
  });

  it('never invokes the scanner for truncated, corrupt or oversized streams', async () => {
    const run = vi.fn(async () => 0);
    await expect(scanLocalContent(stream(bytes.subarray(1)), metadata, config(), undefined, { run })).rejects.toBeInstanceOf(ContentRejected);
    await expect(scanLocalContent(stream(), { ...metadata, checksum: 'a'.repeat(64) }, config(), undefined, { run })).rejects.toBeInstanceOf(ContentRejected);
    await expect(scanLocalContent(stream(Buffer.concat([bytes, bytes])), metadata, config(), undefined, { run })).rejects.toBeInstanceOf(ContentRejected);
    expect(run).not.toHaveBeenCalled();
    expect(await readdir(folder)).toEqual([]);
  });

  it('fails closed on timeout and invalid command, database, size or timeout configuration', async () => {
    await expect(scanLocalContent(stream(), metadata, config(), undefined, { run: async () => { throw Object.assign(new Error('timeout'), { killed: true }); } })).rejects.toMatchObject({ status: 503 });
    for (const invalid of [{ command: 'clamscan' }, { database: 'relative-signatures' }, { timeoutMs: 0 }, { timeoutMs: Number.NaN }]) {
      await expect(scanLocalContent(stream(), metadata, { ...config(), ...invalid }, undefined, clean)).rejects.toMatchObject({ status: 503 });
    }
    await expect(scanLocalContent(stream(), { ...metadata, byteSize: 513 * 1024 ** 2 }, config(), undefined, clean)).rejects.toBeInstanceOf(ContentRejected);
    expect(await readdir(folder)).toEqual([]);
  });

  it('rechecks video duration from the private bytes with the existing metadata inspector', async () => {
    const inspectMetadata = vi.fn(async (body: AsyncIterable<Uint8Array>, mime: string, rules: { maxDurationSeconds?: number }) => {
      const chunks: Uint8Array[] = []; for await (const chunk of body) chunks.push(chunk);
      expect(Buffer.concat(chunks).equals(bytes)).toBe(true);
      expect(mime).toBe('video/mp4'); expect(rules.maxDurationSeconds).toBe(60);
      return { durationSeconds: 40 };
    });
    const result = await scanLocalContent(stream(), { ...metadata, mimeType: 'video/mp4' }, config(), 60, { ...clean, inspectMetadata });
    expect(result.detail.durationSeconds).toBe(40);
    expect(inspectMetadata).toHaveBeenCalledOnce();
    await expect(scanLocalContent(stream(), { ...metadata, mimeType: 'video/mp4' }, config(), 60, { ...clean, inspectMetadata: async () => ({ durationSeconds: 61 }) })).rejects.toBeInstanceOf(ContentRejected);
    expect(await readdir(folder)).toEqual([]);
  });

  it('selects explicitly configured local scanning while production ignores development bypass', async () => {
    vi.stubEnv('FILE_SCAN_COMMAND', process.execPath); vi.stubEnv('FILE_SCAN_DATABASE', resolve('signatures'));
    vi.stubEnv('FILE_SCAN_TIMEOUT_MS', '600000'); vi.stubEnv('STORAGE_DEV_SKIP_SCAN', 'true');
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('APP_ENV', 'development');
    const scan = vi.spyOn(localScanner, 'scanLocalContent').mockResolvedValue({ status: 'clean', detail: { engine: 'ClamAV', checkedAt: 'verified' } });
    expect((await scanContent(stream(), metadata)).status).toBe('clean');
    expect(scan).toHaveBeenCalledOnce();
    expect(scan.mock.calls[0][2]).toMatchObject({ command: process.execPath, database: resolve('signatures'), timeoutMs: 600000 });
  });
});
