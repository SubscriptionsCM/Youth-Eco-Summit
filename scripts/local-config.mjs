import { readFile, chmod, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseEnv } from 'node:util';

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const localRoot = resolve(projectRoot, '.local');
export const envPath = resolve(projectRoot, '.env.local');
export const inboxPath = resolve(localRoot, 'inbox/messages.jsonl');

export function refuseProduction(environment = process.env) {
  if (environment.NODE_ENV === 'production' || (environment.APP_ENV && environment.APP_ENV !== 'development')) {
    throw new Error('Local integration tools refuse production or non-development environments.');
  }
}

export function validateLocalEnvironment(environment) {
  refuseProduction(environment);
  if (environment.YES_LOCAL_RUNTIME !== 'true' || environment.APP_ENV !== 'development') throw new Error('A marked local development configuration is required.');
  const database = new URL(environment.DATABASE_URL || '');
  if (!['postgres:', 'postgresql:'].includes(database.protocol) || database.hostname !== '127.0.0.1' || database.port !== '5432' || database.pathname !== '/yes_local_integration' || database.search) throw new Error('Refusing any database other than loopback yes_local_integration.');
  const required = {
    APP_ORIGIN: 'http://127.0.0.1:3010', SMS_WEBHOOK_URL: 'http://127.0.0.1:4011/sms',
    EMAIL_WEBHOOK_URL: 'http://127.0.0.1:4011/email', S3_ENDPOINT: 'http://127.0.0.1:4012',
    S3_BUCKET: 'yes-local-integration', S3_REGION: 'us-east-1', S3_FORCE_PATH_STYLE: 'true',
    DATABASE_SSL: 'false', AUTH_DELIVERY_ENABLED: 'true', STORAGE_DEV_SKIP_SCAN: 'true',
  };
  for (const [key, expected] of Object.entries(required)) if (environment[key] !== expected) throw new Error(`Local ${key} has an unsafe or unexpected value.`);
  if (environment.FILE_SCAN_URL || environment.FILE_SCAN_TOKEN || environment.AWS_SESSION_TOKEN) throw new Error('Local runtime must not inherit remote scanner or session credentials.');
  if ((environment.AUTH_SECRET?.length || 0) < 32 || (environment.SMS_WEBHOOK_TOKEN?.length || 0) < 32 || (environment.EMAIL_WEBHOOK_TOKEN?.length || 0) < 32) throw new Error('Local secrets have not been generated.');
  if (environment.AWS_ACCESS_KEY_ID !== 'S3RVER' || environment.AWS_SECRET_ACCESS_KEY !== 'S3RVER') throw new Error('Only the fake local emulator credentials are allowed.');
  return environment;
}

export async function loadLocalEnvironment() {
  refuseProduction();
  const saved = parseEnv(await readFile(envPath, 'utf8'));
  const environment = validateLocalEnvironment({ ...process.env, ...saved });
  await chmod(envPath, 0o600);
  return environment;
}

export async function privateDirectory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  await chmod(path, 0o700);
}
