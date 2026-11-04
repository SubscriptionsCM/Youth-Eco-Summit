import { spawn } from 'node:child_process';
import { loadLocalEnvironment, projectRoot } from './local-config.mjs';

const environment = await loadLocalEnvironment();
const children = ['scripts/local-delivery.mjs', 'scripts/local-storage.mjs'].map(script => spawn(process.execPath, [script], { cwd: projectRoot, env: environment, stdio: 'inherit' }));
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stop);
for (const child of children) {
  child.once('error', () => { console.error('Local service failed to start.'); process.exitCode = 1; stop(); });
  child.once('exit', code => { if (!stopping) { process.exitCode = code || 1; stop(); } });
}
