import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const php = ['C:/xampp/php/php.exe', '/usr/bin/php', '/usr/local/bin/php'].find(existsSync);
const bridgePath = path.resolve('wordpress/yes-next-account-bridge/bridge.php');
const source = 'https://wordpress.example.org';

describe.skipIf(!php)('private PHP dispatch isolation', () => {
  let wordpressRoot = '';
  beforeAll(async () => {
    wordpressRoot = await mkdtemp(path.join(tmpdir(), 'yes-wordpress-cli-'));
    await writeFile(path.join(wordpressRoot, 'wp-load.php'), `<?php
// WordPress/plugin includes share the bootstrap scope and may use generic names.
$action = 'a-plugin-action';
$input = array('unrelated' => true);
$request = null;
$root = '/a-plugin-root';
$yes_fixture_boot_marker = 'loaded';
echo 'plugin bootstrap output';
function home_url() { return '${source}'; }
function untrailingslashit($value) { return rtrim($value, '/'); }
class WP_User {
 public $ID = 123;
 public $user_status = 0;
 public $user_email = 'synthetic@example.org';
 public $user_login = 'synthetic-user';
 public $display_name = 'Synthetic participant';
 public $user_pass = 'private-synthetic-source-hash';
 public $roles = array('administrator');
 public function exists() { return true; }
}
function get_userdata($id) {
 global $yes_fixture_boot_marker;
 if ($yes_fixture_boot_marker !== 'loaded') { throw new RuntimeException(); }
 return $id === 123 ? new WP_User() : false;
}
function is_email($email) { return filter_var($email, FILTER_VALIDATE_EMAIL); }
function get_user_meta($id, $key, $single) { return $key === 'account_status' ? 'approved' : ''; }
function wp_salt($scheme) { return 'synthetic-private-salt'; }
function wp_mail($to, $subject, $body) {
 return $to === 'synthetic@example.org' && $subject === 'Synthetic subject' && $body === 'Synthetic body';
}
function retrieve_password($contact) {
 if (($_SERVER['HTTPS'] ?? '') !== 'on' || ($_SERVER['HTTP_HOST'] ?? '') !== 'wordpress.example.org'
   || ($_SERVER['SERVER_NAME'] ?? '') !== 'wordpress.example.org' || ($_SERVER['SERVER_PORT'] ?? '') !== '443') { throw new RuntimeException(); }
 return true;
}
`);
  });
  afterAll(async () => {
    if (path.dirname(wordpressRoot) !== path.resolve(tmpdir()) || !path.basename(wordpressRoot).startsWith('yes-wordpress-cli-')) throw new Error('Unexpected fixture cleanup path');
    await rm(wordpressRoot, { recursive: true, force: true });
  });

  function call(action: string, input: Record<string, unknown>, origin = source) {
    return new Promise<Record<string, any>>((resolve, reject) => {
      const child = execFile(php!, [bridgePath], { encoding: 'utf8', timeout: 10000, maxBuffer: 16384, windowsHide: true,
        env: { NODE_ENV: 'test', PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WORDPRESS_ROOT: wordpressRoot, WORDPRESS_ORIGIN: origin },
      }, (error, stdout) => {
        if (error) { reject(error); return; }
        try { resolve(JSON.parse(stdout)); } catch (parseError) { reject(parseError); }
      });
      child.stdin?.on('error', reject);
      child.stdin?.end(JSON.stringify({ action, input }));
    });
  }

  it('preserves an invalid-status request despite bootstrap variable collisions', async () => {
    expect(await call('status', { sourceUserId: '0' })).toEqual({ ok: false, error: 'credentials' });
  });

  it('keeps WordPress bootstrap global and returns only the requested safe identity', async () => {
    const result = await call('status', { sourceUserId: '123' });
    expect(result).toMatchObject({ ok: true, data: { source, sourceUserId: '123', email: 'synthetic@example.org' } });
    expect(result.data.credentialFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.data).not.toHaveProperty('roles');
    expect(result.data).not.toHaveProperty('user_pass');
    expect(JSON.stringify(result)).not.toContain('private-synthetic-source-hash');
  });

  it('dispatches private mail arguments after colliding plugin globals', async () => {
    expect(await call('mail', { to: 'synthetic@example.org', subject: 'Synthetic subject', body: 'Synthetic body' })).toEqual({ ok: true, data: { sent: true } });
  });

  it('preserves the source-origin guard', async () => {
    expect(await call('status', { sourceUserId: '123' }, 'https://untrusted.example.org')).toEqual({ ok: false, error: 'unavailable' });
  });

  it('establishes the configured HTTPS context before native password recovery', async () => {
    expect(await call('recovery', { contact: 'synthetic-user' })).toEqual({ ok: true, data: { sent: true } });
  });
});
