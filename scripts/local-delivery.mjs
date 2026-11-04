import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { appendFile, chmod } from 'node:fs/promises';
import { dirname } from 'node:path';
import { loadLocalEnvironment, inboxPath, privateDirectory } from './local-config.mjs';

process.umask(0o077);
const environment = await loadLocalEnvironment();
await privateDirectory(dirname(inboxPath));
await appendFile(inboxPath, '', { mode: 0o600 });
await chmod(inboxPath, 0o600);

const reply = (res, status, payload) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(payload));
};
const authorized = (received, expected) => {
  const actual = Buffer.from(received || ''), wanted = Buffer.from(`Bearer ${expected}`);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
};
const delivery = createServer(async (req, res) => {
  if (!['127.0.0.1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '')) return reply(res, 403, { error: 'Local access only' });
  if (req.method === 'GET' && req.url === '/health') return reply(res, 200, { local: true, delivery: 'capture-only', storage: 'moto' });
  const kind = req.url === '/sms' ? 'sms' : req.url === '/email' ? 'email' : null;
  if (!kind || req.method !== 'POST') return reply(res, 404, { error: 'Not found' });
  if (!authorized(req.headers.authorization, environment[kind === 'sms' ? 'SMS_WEBHOOK_TOKEN' : 'EMAIL_WEBHOOK_TOKEN'])) return reply(res, 401, { error: 'Unauthorized' });
  if (!req.headers['content-type']?.startsWith('application/json')) return reply(res, 415, { error: 'JSON required' });
  try {
    let size = 0; const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 16384) { reply(res, 413, { error: 'Payload too large' }); req.resume(); return; }
      chunks.push(chunk);
    }
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!payload || typeof payload.to !== 'string' || payload.to.length > 320 || (kind === 'sms' && (typeof payload.code !== 'string' || !/^\d{6}$/.test(payload.code))) || (kind === 'email' && (typeof payload.subject !== 'string' || typeof payload.body !== 'string'))) return reply(res, 400, { error: 'Invalid capture payload' });
    const message = { kind, to: payload.to, ...(kind === 'sms' ? { code: payload.code, expiresIn: payload.expiresIn } : { subject: payload.subject, body: payload.body }), receivedAt: new Date().toISOString() };
    await appendFile(inboxPath, JSON.stringify(message) + '\n', { mode: 0o600 });
    reply(res, 202, { captured: true, local: true });
  } catch { reply(res, 400, { error: 'Capture failed' }); }
});
await new Promise((ok, fail) => { delivery.once('error', fail); delivery.listen(4011, '127.0.0.1', ok); });
console.log('Local capture: http://127.0.0.1:4011; private inbox: .local/inbox/messages.jsonl. No external delivery.');
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  if (stopping) return;
  stopping = true;
  delivery.close(() => process.exit(0));
});
