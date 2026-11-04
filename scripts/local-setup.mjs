import { randomBytes } from 'node:crypto';
import { writeFile, access } from 'node:fs/promises';
import { userInfo } from 'node:os';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import pg from 'pg';
import { envPath, projectRoot, localRoot, refuseProduction, loadLocalEnvironment, privateDirectory } from './local-config.mjs';

process.umask(0o077);
refuseProduction();
await privateDirectory(localRoot);
await privateDirectory(resolve(localRoot, 'inbox'));
await privateDirectory(resolve(localRoot, 'storage'));
let exists = true;
try { await access(envPath); } catch (error) { if (error.code !== 'ENOENT') throw error; exists = false; }
if (!exists) {
  const secret = () => randomBytes(32).toString('hex');
  const databaseUser = userInfo().username;
  const configuration = {
    YES_LOCAL_RUNTIME: 'true', APP_ENV: 'development', APP_ORIGIN: 'http://127.0.0.1:3010',
    DATABASE_URL: `postgresql://${encodeURIComponent(databaseUser)}@127.0.0.1:5432/yes_local_integration`, DATABASE_SSL: 'false',
    AUTH_SECRET: secret(), AUTH_DELIVERY_ENABLED: 'true', AUTH_TRUSTED_IP_HEADER: '',
    SMS_WEBHOOK_URL: 'http://127.0.0.1:4011/sms', SMS_WEBHOOK_TOKEN: secret(),
    EMAIL_WEBHOOK_URL: 'http://127.0.0.1:4011/email', EMAIL_WEBHOOK_TOKEN: secret(),
    S3_ENDPOINT: 'http://127.0.0.1:4012', S3_REGION: 'us-east-1', S3_BUCKET: 'yes-local-integration', S3_FORCE_PATH_STYLE: 'true',
    AWS_ACCESS_KEY_ID: 'S3RVER', AWS_SECRET_ACCESS_KEY: 'S3RVER', AWS_SESSION_TOKEN: '',
    STORAGE_DEV_SKIP_SCAN: 'true', FILE_SCAN_URL: '', FILE_SCAN_TOKEN: '', FILE_SCAN_TIMEOUT_MS: '600000',
  };
  await writeFile(envPath, '# LOCAL INTEGRATION ONLY. Never deploy this file. No NODE_ENV override.\n' + Object.entries(configuration).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { flag: 'wx', mode: 0o600 });
}
const environment = await loadLocalEnvironment();
const connection = new URL(environment.DATABASE_URL);
connection.pathname = '/postgres';
const administrator = new pg.Client({ connectionString: connection.toString(), ssl: false });
try {
  await administrator.connect();
  const existing = await administrator.query('SELECT 1 FROM pg_database WHERE datname=$1', ['yes_local_integration']);
  if (!existing.rowCount) await administrator.query('CREATE DATABASE yes_local_integration');
} finally { await administrator.end(); }

async function run(script) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', script], { cwd: projectRoot, env: environment, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolvePromise() : reject(new Error(`${script} failed with status ${code}`)));
  });
}
await run('scripts/migrate.ts');
await run('scripts/seed.ts');
console.log('Local database migrated. Unapproved drafts seeded. Private .env.local is ready; secrets were not printed.');
