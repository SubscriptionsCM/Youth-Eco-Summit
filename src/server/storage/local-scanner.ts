import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { AppError } from '../core';
import { MAX_STORAGE_OBJECT_BYTES } from './tokens';
import { ContentRejected, inspectFileMetadata, validateMetadata, type FileRules, type VerifiedMetadata } from './validation';

export type LocalScannerConfig = { command: string; database?: string; timeoutMs: number; tempDirectory?: string };
export type LocalScannerDependencies = {
  run: (command: string, args: string[], options: { shell: false; windowsHide: true; timeout: number; maxBuffer: number; killSignal: 'SIGKILL' }) => Promise<number>;
  inspectMetadata?: (body: AsyncIterable<Uint8Array>, mime: string, rules: FileRules) => Promise<VerifiedMetadata>;
};

const runScanner: LocalScannerDependencies['run'] = (command, args, options) => new Promise((resolve, reject) => {
  execFile(command, args, options, error => {
    if (!error) { resolve(0); return; }
    if (typeof error.code === 'number' && !error.killed && !error.signal) { resolve(error.code); return; }
    reject(error);
  });
});

function absolutePath(path: string) {
  return isAbsolute(path) && path.length <= 4096 && !/[\u0000-\u001F\u007F]/.test(path);
}

/** Writes exact verified bytes to a private file before executing the configured scanner. */
export async function scanLocalContent(body: AsyncIterable<Uint8Array>, metadata: { checksum: string; mimeType: string; byteSize: number }, config: LocalScannerConfig, maxDuration?: number, dependencies: LocalScannerDependencies = { run: runScanner }): Promise<{ status: string; detail: { engine: string; checkedAt: string; durationSeconds?: number } }> {
  if (!absolutePath(config.command) || (config.database !== undefined && !absolutePath(config.database)) || !Number.isSafeInteger(config.timeoutMs) || config.timeoutMs < 1 || config.timeoutMs > 600000) throw new AppError(503, 'Local file verification is not configured correctly.');
  if (!Number.isSafeInteger(metadata.byteSize) || metadata.byteSize < 1 || metadata.byteSize > MAX_STORAGE_OBJECT_BYTES || !/^[a-f0-9]{64}$/.test(metadata.checksum)) throw new ContentRejected('The file integrity declaration is invalid.');
  const parent = resolve(config.tempDirectory || tmpdir());
  let directory: string | undefined;
  try {
    directory = await mkdtemp(join(parent, 'yes-scan-'));
    await chmod(directory, 0o700);
    const path = join(directory, 'retained-file');
    const handle = await open(path, 'wx', 0o600), hash = createHash('sha256');
    let bytes = 0;
    try {
      for await (const chunk of body) {
        if (!(chunk instanceof Uint8Array)) throw new ContentRejected('The file body is invalid.');
        bytes += chunk.byteLength;
        if (bytes > metadata.byteSize) throw new ContentRejected('The file exceeds its verified size.');
        hash.update(chunk); await handle.writeFile(chunk);
      }
      if (bytes !== metadata.byteSize) throw new ContentRejected('The file does not match its verified size.');
      if (hash.digest('hex') !== metadata.checksum) throw new ContentRejected('The file does not match its verified SHA256.');
      await handle.sync();
    } finally { await handle.close(); }
    const args = ['--no-summary', '--infected', '--scan-archive=yes', `--tempdir=${directory}`, '--max-filesize=512M', '--max-scansize=1024M', '--max-files=10000', '--max-recursion=32', `--max-scantime=${config.timeoutMs}`, '--alert-exceeds-max=yes', '--alert-encrypted=yes', '--fail-if-cvd-older-than=7'];
    if (config.database) args.push(`--database=${config.database}`);
    args.push('--', path);
    const exit = await dependencies.run(config.command, args, { shell: false, windowsHide: true, timeout: config.timeoutMs, maxBuffer: 65536, killSignal: 'SIGKILL' });
    if (exit === 1) throw new ContentRejected('The file failed security screening.');
    if (exit !== 0) throw new AppError(503, 'Local file verification is temporarily unavailable.');
    let durationSeconds: number | undefined;
    if (maxDuration !== undefined && metadata.mimeType.startsWith('video/')) {
      const rules: FileRules = { minCount: 1, maxCount: 1, maxBytes: metadata.byteSize, types: [metadata.mimeType], maxDurationSeconds: maxDuration };
      const input = createReadStream(path);
      let inspected;
      try { inspected = await (dependencies.inspectMetadata || inspectFileMetadata)(input, metadata.mimeType, rules); }
      finally { input.destroy(); }
      validateMetadata(inspected, rules, metadata.mimeType);
      durationSeconds = inspected.durationSeconds;
    }
    return { status: 'clean', detail: { engine: 'ClamAV', durationSeconds, checkedAt: new Date().toISOString() } };
  } catch (error) {
    if (error instanceof ContentRejected) throw error;
    throw new AppError(503, 'Local file verification is temporarily unavailable.');
  } finally {
    if (directory) {
      const within = relative(parent, resolve(directory));
      if (!within || within.startsWith('..') || isAbsolute(within)) throw new AppError(503, 'Local file verification cleanup is unavailable.');
      try { await rm(directory, { recursive: true, force: true }); }
      catch { throw new AppError(503, 'Local file verification cleanup is unavailable.'); }
    }
  }
}
