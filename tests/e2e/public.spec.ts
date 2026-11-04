import { expect, test } from '@playwright/test';

test('showcase displays only approved text and scoped public media', async ({ page }) => {
  await page.route('**/api/public/showcase', route => route.fulfill({ json: { data: { items: [{ id: 'publication-one', title: 'Approved artwork', summary: 'Approved public summary.', award: null, competition: 'Configured competition', guardian_contact: 'private@example.test', assets: [{ id: 'image-one', mime_type: 'image/png' }, { id: 'document-one', mime_type: 'application/pdf' }] }] } } }));
  await page.route('**/api/public/showcase/publication-one/media/image-one', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHn8AAAAASUVORK5CYII=', 'base64') }));
  await page.goto('/showcase');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/See what\s*students see\./);
  await expect(page.getByRole('heading', { name: 'Approved artwork' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Approved artwork' })).toHaveAttribute('src', '/api/public/showcase/publication-one/media/image-one');
  await expect(page.getByRole('link', { name: 'Open approved document' })).toHaveAttribute('href', '/api/public/showcase/publication-one/media/document-one');
  await expect(page.getByText('private@example.test')).toHaveCount(0);
});

test('empty showcase does not invent published entries', async ({ page }) => {
  await page.route('**/api/public/showcase', route => route.fulfill({ json: { data: { items: [] } } }));
  await page.goto('/showcase');
  await expect(page.getByText('No student work has been published yet.', { exact: false })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(0);
});

test('planned competition lineup is visible before entries open and primary navigation works', async ({ page }) => {
  await page.route('**/api/public/config', route => route.fulfill({ json: { data: { configured: false, editions: [], competitions: [], content: [] } } }));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Your ideas\.\s*Bigger\s*stage\./);
  await page.getByRole('link', { name: 'Explore competitions' }).click();
  await page.waitForURL('**/competitions');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Find your\s*way in\./);
  await expect(page.getByText('2027 competition lineup', { exact: true })).toBeVisible();
  await expect(page.getByText('Final guidelines, class categories and entry dates will follow.', { exact: false })).toBeVisible();
  await expect(page.locator('#challenges article')).toHaveCount(8);
  await expect(page.getByRole('link', { name: 'Guidelines & eligibility' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Eco-Business Model' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test('participant records require sign in and do not leak sample data', async ({ page }) => {
  await page.route('**/api/auth/session', route => route.fulfill({ json: { data: { actor: null } } }));
  await page.goto('/dashboard');
  await expect(page.getByText('to continue. Your records are available only through your verified account.', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Registered students' })).toHaveCount(0);
});

test('unapproved consent blocks student registration even for a signed-in participant', async ({ page }) => {
  await page.route('**/api/auth/session', route => route.fulfill({ json: { data: { actor: { id: 'participant', role: 'participant' } } } }));
  await page.route('**/api/public/config', route => route.fulfill({ json: { data: { editions: [{ id: 'edition', state: 'open', config: { registrationApproved: false } }], competitions: [], content: [{ key: 'privacy', body: 'Approved privacy text' }, { key: 'terms', body: 'Approved terms' }] } } }));
  await page.goto('/register');
  await expect(page.getByText('Student registration is currently closed.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review registration' })).toHaveCount(0);
});

test('failed nomination preserves form values and displays a usable error', async ({ page }) => {
  await page.route('**/api/public/config', route => route.fulfill({ json: { data: { editions: [], competitions: [], content: [{ key: 'privacy', body: 'Approved privacy text' }, { key: 'terms', body: 'Approved terms' }] } } }));
  await page.route('**/api/public/schools?**', route => route.fulfill({ json: { data: { items: [], total: 0, page: 1, pageSize: 25 } } }));
  await page.route('**/api/public/nominations', route => route.fulfill({ status: 503, json: { error: 'School nominations are temporarily unavailable.' } }));
  await page.goto('/schools');
  await page.getByLabel('School name (required)', { exact: true }).fill('Sample school');
  await page.getByLabel('City or district (required)', { exact: true }).fill('Sample city');
  await page.getByLabel('State (required)', { exact: true }).fill('Sample state');
  await page.getByLabel('School address (required)').fill('Sample address');
  await page.getByLabel('Your contact phone or email (required)').fill('parent@example.test');
  await page.getByRole('button', { name: 'Nominate school' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('temporarily unavailable');
  await expect(page.getByLabel('School name (required)', { exact: true })).toHaveValue('Sample school');
  await expect(page.getByRole('heading', { name: 'Nomination received' })).toHaveCount(0);
});
