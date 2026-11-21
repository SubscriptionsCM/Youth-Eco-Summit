import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { db } from '../../src/server/db';

type Account = { contact: string; password: string; username?: string; role: string };
type Access = { prefix: string; origin: string; accounts: Record<string, Account>; fixtures: { schoolReference: string; studentDraftId: string } };
let access: Access;
async function capturedCode(contact: string, after: number) {
  for (let attempt = 0; attempt < 150; attempt++) {
    const records = (await readFile('.local/migration-qa/messages.jsonl', 'utf8')).split('\n').slice(0, -1).filter(Boolean).map(line => JSON.parse(line));
    const found = records.reverse().find(row => row.to.includes(contact) && Date.parse(row.receivedAt) >= after);
    const raw = String(found?.raw || '').replace(/=\r?\n/g, '').replace(/=([A-Fa-f0-9]{2})/g, (_match, value) => String.fromCharCode(parseInt(value, 16)));
    const code = raw.match(/\b(\d{6})\b/)?.[1];
    if (code) return code;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('The browser account did not receive a captured verification code.');
}

test.beforeAll(async () => {
  access = JSON.parse(await readFile('.local/migration-qa/access.json', 'utf8'));
  expect(access.prefix).toMatch(/^YES-MIGRATION-QA-/);
  expect(access.origin).toBe(process.env.APP_ORIGIN);
  for (const account of Object.values(access.accounts)) expect(account.contact).toMatch(/\.test$/);
  expect((await db.query('SELECT current_database() name')).rows[0].name).toBe('yes_local_migration');
  await db.query('DELETE FROM auth_rates'); // Separate browser cases share one isolated loopback network.
});

test('real public navigation and mobile layout work without mock APIs', async ({ page }) => {
  for (const path of ['/', '/competitions', '/schools', '/resources', '/faq', '/login']) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('main').getByRole('heading', { level: 1 }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), path).toBe(false);
  }
});

test('new participant completes browser signup, email verification and password recovery', async ({ page }, testInfo) => {
  const unique = Date.now().toString(36), contact = `${access.prefix}-${testInfo.project.name}-${unique}@example.test`.toLowerCase();
  const username = `yes_migration_qa_${testInfo.project.name}_${unique}`, password = randomBytes(24).toString('base64url');
  await page.goto('/login');
  await page.getByRole('button', { name: 'Create a new account', exact: true }).click();
  await page.locator('select[name="formKey"]').selectOption('teacher');
  await page.getByLabel(/^Name \(Username\)/).fill(username);
  await page.getByLabel('Email address (required)', { exact: true }).fill(contact);
  await page.getByLabel('Password (required)', { exact: true }).fill(password);
  await page.getByLabel('Confirm password (required)', { exact: true }).fill(password);
  const signupAfter = Date.now();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Verify your email', exact: true })).toBeVisible();
  await page.getByLabel('Email confirmation code (required)', { exact: true }).fill(await capturedCode(contact, signupAfter));
  await page.getByRole('button', { name: 'Verify email', exact: true }).click();
  await page.waitForURL('**/dashboard');
  const before = (await (await page.request.get('/api/auth/session')).json()).data.actor;
  expect(before.contact).toBe(contact);
  expect((await page.request.post('/api/auth/logout', { headers: { Origin: access.origin }, data: {} })).status()).toBe(200);
  await page.goto('/login');
  await page.getByRole('button', { name: 'Forgot your password?', exact: true }).click();
  await page.getByLabel('Username or email (required)', { exact: true }).fill(username);
  const recoveryAfter = Date.now();
  await page.getByRole('button', { name: 'Send recovery code', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Reset your password', exact: true })).toBeVisible();
  const replacement = randomBytes(24).toString('base64url');
  await page.getByLabel('Recovery code (required)', { exact: true }).fill(await capturedCode(contact, recoveryAfter));
  await page.getByLabel('New password (required)', { exact: true }).fill(replacement);
  await page.getByLabel('Confirm new password (required)', { exact: true }).fill(replacement);
  await page.getByRole('button', { name: 'Reset password', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to your account', exact: true })).toBeVisible();
  await page.getByLabel('Username or email (required)', { exact: true }).fill(username);
  await page.getByLabel('Password (required)', { exact: true }).fill(replacement);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/dashboard');
  expect((await (await page.request.get('/api/auth/session')).json()).data.actor.id).toBe(before.id);
});

for (const role of ['owner', 'admin', 'judge', 'school', 'student', 'educator']) {
  test(`${role} signs in through the real browser and receives the correct workspace`, async ({ page }) => {
    const account = access.accounts[role];
    await page.goto('/login');
    if (['owner', 'admin', 'judge'].includes(role)) {
      await page.getByRole('button', { name: 'Admin or judge', exact: true }).click();
      await page.getByLabel('Staff email (required)', { exact: true }).fill(account.contact);
      await page.getByLabel('Password (required)', { exact: true }).fill(account.password);
      await page.getByLabel('Confirm password (required)', { exact: true }).fill(account.password);
    } else {
      await page.getByLabel('Username or email (required)', { exact: true }).fill(account.contact);
      await page.getByLabel('Password (required)', { exact: true }).fill(account.password);
    }
    const signedIn = page.waitForResponse(response => response.url().endsWith(['owner', 'admin', 'judge'].includes(role) ? '/api/auth/login' : '/api/auth/participant/login') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    expect((await signedIn).status()).toBe(200);
    await page.waitForURL(url => url.pathname !== '/login');
    await expect(page.getByRole('main')).toBeVisible();
    const session = await page.request.get('/api/auth/session');
    expect(session.status()).toBe(200);
    const actor = (await session.json()).data.actor;
    expect(actor.role).toBe(['school', 'student', 'educator'].includes(role) ? 'participant' : role);
    const administrative = await page.request.get('/api/admin/students');
    expect(administrative.status()).toBe(['owner', 'admin'].includes(role) ? 200 : 403);
    if (['school', 'student', 'educator'].includes(role)) {
      const records = await page.request.get('/api/forms/records');
      expect(records.status()).toBe(200);
      await page.goto('/dashboard');
      await expect(page.getByRole('main')).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  });
}

test('anonymous browser cannot resume another account draft or download private records', async ({ page }) => {
  const response = await page.request.get(`/api/forms/records/${access.fixtures.studentDraftId}`);
  expect(response.status()).toBe(404);
  expect(response.headers()['cache-control']).toContain('no-store');
  await page.goto('/dashboard');
  await expect(page.getByRole('main')).toContainText(/sign in/i);
  expect((await page.request.get('/api/auth/session')).status()).toBe(200);
});
