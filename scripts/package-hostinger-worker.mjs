import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { nodeFileTrace } = require('next/dist/compiled/@vercel/nft');
const root = process.cwd();
const worker = '.local/hostinger-worker/worker.mjs';
await build({ entryPoints: ['scripts/worker.ts'], bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: worker });
const { fileList } = await nodeFileTrace([worker], { base: root, processCwd: root });
const destination = resolve(root, '.next/standalone');
for (const file of fileList) {
  if (!file.replaceAll('\\', '/').startsWith('node_modules/')) continue;
  const target = resolve(destination, file);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve(root, file), target);
}
await copyFile(resolve(root, worker), resolve(destination, 'worker.mjs'));
console.log(`Packaged worker with ${fileList.size - 1} traced dependency files.`);
