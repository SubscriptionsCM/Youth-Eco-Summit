import { spawn } from 'node:child_process';
import { open, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { S3Client, ListBucketsCommand, CreateBucketCommand, PutBucketVersioningCommand, PutBucketCorsCommand, PutPublicAccessBlockCommand } from '@aws-sdk/client-s3';
import { loadLocalEnvironment, projectRoot, localRoot, privateDirectory } from './local-config.mjs';

process.umask(0o077);
const environment = await loadLocalEnvironment();
await privateDirectory(localRoot);
const executable = resolve(localRoot, 'moto-venv/bin/moto_server');
try { await access(executable); } catch { throw new Error('Install Moto locally: python3 -m venv .local/moto-venv && .local/moto-venv/bin/python -m pip install "moto[server]==5.2.2"'); }
const log = await open(resolve(localRoot, 'moto.log'), 'a', 0o600);
await log.chmod(0o600);
const child = spawn(executable, ['-H', '127.0.0.1', '-p', '4012'], {
  cwd: projectRoot, env: { ...environment, AWS_EC2_METADATA_DISABLED: 'true', MOTO_S3_CUSTOM_ENDPOINTS: environment.S3_ENDPOINT, MOTO_CALL_RESET_API: 'false' },
  stdio: ['ignore', log.fd, log.fd],
});
let stopped = false;
const stop = () => { if (!stopped) { stopped = true; child.kill('SIGTERM'); } };
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stop);
child.once('error', () => { console.error('Local Moto could not start.'); process.exitCode = 1; });
child.once('exit', code => { if (!stopped) { stopped = true; process.exitCode = code || 1; } });
const s3 = new S3Client({ endpoint: environment.S3_ENDPOINT, region: environment.S3_REGION, forcePathStyle: true, maxAttempts: 1, credentials: { accessKeyId: environment.AWS_ACCESS_KEY_ID, secretAccessKey: environment.AWS_SECRET_ACCESS_KEY }, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
try {
  let ready = false;
  for (let attempt = 0; attempt < 80 && !stopped; attempt++) {
    try { await s3.send(new ListBucketsCommand({})); ready = true; break; } catch { await setTimeout(250); }
  }
  if (!ready) throw new Error('Local Moto did not become ready. Inspect private .local/moto.log.');
  const Bucket = environment.S3_BUCKET;
  await s3.send(new CreateBucketCommand({ Bucket }));
  await s3.send(new PutBucketVersioningCommand({ Bucket, VersioningConfiguration: { Status: 'Enabled' } }));
  await s3.send(new PutPublicAccessBlockCommand({ Bucket, PublicAccessBlockConfiguration: { BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: true } }));
  await s3.send(new PutBucketCorsCommand({ Bucket, CORSConfiguration: { CORSRules: [{ AllowedOrigins: [environment.APP_ORIGIN], AllowedMethods: ['PUT'], AllowedHeaders: ['*'], ExposeHeaders: ['ETag'], MaxAgeSeconds: 300 }] } }));
  console.log('Local Moto S3: http://127.0.0.1:4012; versioned bucket yes-local-integration. Object state lasts for this process.');
} catch (error) { stop(); throw error; }
finally { s3.destroy(); await log.close(); }
