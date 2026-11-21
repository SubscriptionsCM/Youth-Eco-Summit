import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuth, hashPassword } from '../src/server/auth';
import { testDb } from './helpers/db';

describe('staff username aliases', () => {
  let fixture: Awaited<ReturnType<typeof testDb>>;
  let auth: ReturnType<typeof createAuth>;
  const origin = 'https://staff.example.test';
  const password = 'Private test staff password 123!';
  const delivered: { contact: string; body: string }[] = [];
  const bridge = { call: vi.fn() };
  const request = (path: string, input: unknown = {}, cookie?: string) => new Request(`${origin}/api/auth/${path}`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(input),
  });
  const action = (path: string, input: unknown = {}, cookie?: string) => auth.authAction(request(path, input, cookie), ['auth', ...path.split('/')]);
  async function staff(role = 'owner', username: string | null = null, contact = `${role}@example.test`) {
    const id = randomUUID(), token = randomBytes(32).toString('hex');
    await fixture.db.query('INSERT INTO users(id,role,contact,password_hash,staff_username) VALUES($1,$2,$3,$4,$5)', [id, role, contact, await hashPassword(password), username]);
    await fixture.db.query("INSERT INTO auth_sessions(token_hash,user_id,auth_version,expires_at) VALUES($1,$2,0,now()+interval '1 hour')", [createHash('sha256').update(token).digest('hex'), id]);
    return { id, cookie: `yes_session=${token}` };
  }
  async function invite(cookie: string, input: Record<string, unknown> = {}) {
    expect((await action('invitations', { contact: 'new-staff@example.test', role: 'admin', staffUsername: ' Rudhraksh ', ...input }, cookie))?.status).toBe(200);
    return new URL(delivered.at(-1)!.body).searchParams.get('token');
  }
  beforeEach(async () => {
    fixture = await testDb(); delivered.length = 0; bridge.call.mockReset();
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('External auth must not run'); }));
    auth = createAuth(fixture.db, { origin, secret: 'test-only-staff-alias-secret-at-least-32-characters', secureCookies: false, wordpressBridge: bridge,
      sendEmail: async (contact, _subject, body) => { delivered.push({ contact, body }); },
    });
  });
  afterEach(async () => {
    expect(bridge.call).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    await fixture?.close(); vi.unstubAllGlobals();
  });

  it.each(['owner', 'admin', 'judge'])('accepts username and email case for active %s without trusting a client role', async role => {
    const user = await staff(role, 'staff.alias-1');
    for (const contact of [' STAFF.ALIAS-1 ', ` ${role.toUpperCase()}@EXAMPLE.TEST `]) {
      const response = await action('login', { contact, password, role: 'owner', staffUsername: 'different' });
      expect(response?.status).toBe(200);
      expect((await response!.json()).data.actor).toMatchObject({ id: user.id, role, contact: `${role}@example.test` });
      expect((await auth.getActor(request('session', {}, response!.headers.get('set-cookie')!)))?.role).toBe(role);
    }
  });

  it('returns the same generic failure for wrong, missing, invalid, display-name and inactive aliases', async () => {
    const user = await staff('admin', 'rudhraksh');
    await fixture.db.query("UPDATE users SET name='display-only' WHERE id=$1", [user.id]);
    const failures = [];
    for (const contact of ['rudhraksh', 'missing-staff', 'display-only', 'a', 'Kelvin']) {
      const response = await action('login', { contact, password: contact === 'rudhraksh' ? 'Wrong password 123!' : password });
      expect(response?.status).toBe(401); failures.push(await response!.json());
    }
    await fixture.db.query('UPDATE users SET active=false WHERE id=$1', [user.id]);
    const inactive = await action('login', { contact: 'RUDHRAKSH', password });
    expect(inactive?.status).toBe(401); failures.push(await inactive!.json());
    expect(new Set(failures.map(failure => failure.error)).size).toBe(1);
    expect((await fixture.db.query("SELECT count FROM auth_rates WHERE key=$1", [`login:contact:${createHash('sha256').update('admin@example.test').digest('hex')}`])).rows[0].count).toBe(2);
  });

  it('shares the existing ten-attempt limit between an alias and its email', async () => {
    await staff('admin', 'rudhraksh');
    for (let attempt = 0; attempt < 10; attempt++) {
      expect((await action('login', { contact: attempt % 2 ? 'ADMIN@EXAMPLE.TEST' : 'RUDHRAKSH', password: 'Wrong password 123!' }))?.status).toBe(401);
    }
    expect((await action('login', { contact: 'rudhraksh', password }))?.status).toBe(429);
    expect((await action('login', { contact: 'admin@example.test', password }))?.status).toBe(429);
  });

  it('excludes participant credentials and usernames from staff login', async () => {
    const id = randomUUID();
    await fixture.db.query("INSERT INTO users(id,role,contact,name,password_hash) VALUES($1,'participant','participant@example.test','participant-alias',$2)", [id, await hashPassword(password)]);
    await fixture.db.query("INSERT INTO native_participant_accounts(user_id,username,verified_contact) VALUES($1,'participant-alias','participant@example.test')", [id]);
    for (const contact of ['participant-alias', 'participant@example.test']) expect((await action('login', { contact, password }))?.status).toBe(401);
    await expect(fixture.db.query("UPDATE users SET staff_username='participant-alias' WHERE id=$1", [id])).rejects.toMatchObject({ code: '23514' });
    expect((await fixture.db.query('SELECT token_hash FROM auth_sessions')).rows).toEqual([]);
  });

  it('validates and uniquely stores only lowercase ASCII staff aliases', async () => {
    const owner = await staff();
    for (const staffUsername of ['ab', '1staff', 'staff@example.test', 'staff name', 'Kelvin', 'x'.repeat(61)]) {
      expect((await action('invitations', { contact: 'new-staff@example.test', role: 'admin', staffUsername }, owner.cookie))?.status).toBe(400);
    }
    await staff('admin', 'taken');
    expect((await action('invitations', { contact: 'new-staff@example.test', role: 'admin', staffUsername: 'TAKEN' }, owner.cookie))?.status).toBe(409);
    await expect(fixture.db.query("INSERT INTO users(id,role,contact,staff_username) VALUES($1,'judge','duplicate@example.test','taken')", [randomUUID()])).rejects.toMatchObject({ code: '23505' });
    await expect(fixture.db.query("UPDATE users SET staff_username='Uppercase' WHERE id=$1", [owner.id])).rejects.toMatchObject({ code: '23514' });
    expect(delivered).toHaveLength(0);
  });

  it('binds an admin invitation alias and role to its token and keeps the 12 character minimum', async () => {
    const owner = await staff(), token = await invite(owner.cookie);
    expect((await action('invitation/setup', { token: 'invalid' }))?.status).toBe(401);
    const setup = await action('invitation/setup', { token });
    expect((await setup!.json()).data).toEqual({ contact: 'new-staff@example.test', role: 'admin', staffUsername: 'rudhraksh' });
    expect((await action('invitation/accept', { token, password: 'x'.repeat(11) }))?.status).toBe(400);
    expect((await fixture.db.query('SELECT consumed_at FROM auth_invitations')).rows[0].consumed_at).toBeNull();
    const accepted = await action('invitation/accept', { token, password: 'x'.repeat(12), staffUsername: 'overridden', role: 'owner', contact: 'different@example.test' });
    expect(accepted?.status).toBe(200);
    expect((await accepted!.json()).data).toMatchObject({ accepted: true, staffUsername: 'rudhraksh', role: 'admin' });
    expect((await fixture.db.query('SELECT role,contact,staff_username FROM users WHERE contact=$1', ['new-staff@example.test'])).rows[0]).toEqual({ role: 'admin', contact: 'new-staff@example.test', staff_username: 'rudhraksh' });
    expect((await action('login', { contact: 'RUDHRAKSH', password: 'x'.repeat(12) }))?.status).toBe(200);
    expect((await action('invitation/accept', { token, password }))?.status).toBe(401);
  });

  it('rolls back invitation consumption when another account claims its alias', async () => {
    const owner = await staff(), token = await invite(owner.cookie);
    await staff('judge', 'rudhraksh');
    expect((await action('invitation/accept', { token, password }))?.status).toBe(409);
    expect((await fixture.db.query('SELECT consumed_at FROM auth_invitations')).rows[0].consumed_at).toBeNull();
    expect((await fixture.db.query("SELECT id FROM users WHERE contact='new-staff@example.test'")).rows).toHaveLength(0);
    expect((await action('invitation/setup', { token }))?.status).toBe(200);
  });

  it('preserves email-only invitations and restricts admins to inviting judges with or without aliases', async () => {
    const admin = await staff('admin');
    for (const role of ['owner', 'admin']) expect((await action('invitations', { contact: `${role}-new@example.test`, role, staffUsername: 'new-staff' }, admin.cookie))?.status).toBe(403);
    const token = await invite(admin.cookie, { role: 'judge', staffUsername: undefined });
    const setup = await action('invitation/setup', { token });
    expect((await setup!.json()).data).toMatchObject({ role: 'judge', staffUsername: null });
    expect((await action('invitation/accept', { token, password, staffUsername: 'client-added', role: 'owner' }))?.status).toBe(200);
    expect((await fixture.db.query('SELECT role,staff_username FROM users WHERE contact=$1', ['new-staff@example.test'])).rows[0]).toEqual({ role: 'judge', staff_username: null });
  });

  it('keeps email mandatory for staff invitations and recovery', async () => {
    const owner = await staff('owner', 'rudhraksh');
    expect((await action('invitations', { contact: 'no-email', role: 'admin', staffUsername: 'valid-alias' }, owner.cookie))?.status).toBe(400);
    expect((await action('recovery/request', { contact: 'rudhraksh' }))?.status).toBe(400);
    expect((await action('recovery/request', { contact: 'OWNER@EXAMPLE.TEST' }))?.status).toBe(200);
    expect(delivered).toHaveLength(1); expect(delivered[0].contact).toBe('owner@example.test');
  });
});
