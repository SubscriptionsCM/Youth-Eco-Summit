import { spawn } from 'node:child_process';
import { loadLocalEnvironment, projectRoot } from './local-config.mjs';

const actions = { migrate: 'scripts/migrate.ts', seed: 'scripts/seed.ts', 'competition-drafts': 'scripts/import-2027-competition-drafts.ts', 'guidelines': 'scripts/import-2027-guidelines.ts', 'participation-dates': 'scripts/configure-2027-window.ts', 'verify-guidelines': 'scripts/verify-guidelines-registration.ts', worker: 'scripts/worker.ts', verify: 'scripts/verify-local-integration.ts', app: 'node_modules/next/dist/bin/next' };
const action = process.argv[2];
if (!Object.hasOwn(actions, action) || process.argv.length !== 3) throw new Error('Usage: node scripts/local-run.mjs migrate|seed|competition-drafts|guidelines|participation-dates|verify-guidelines|worker|verify|app');
const environment = await loadLocalEnvironment();
const child = spawn(process.execPath, action === 'app' ? [actions[action], 'dev', '--hostname', '127.0.0.1', '--port', '3010'] : ['--import', 'tsx', actions[action]], { cwd: projectRoot, env: environment, stdio: 'inherit' });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
child.once('error', () => { console.error('Local process could not start.'); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
