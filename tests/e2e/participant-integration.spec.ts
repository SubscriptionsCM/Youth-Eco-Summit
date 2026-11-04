import { expect, test } from '@playwright/test';

test('media refresh preserves unsaved answers and the original concurrency version', async ({ page }) => {
  const id = '11111111-1111-4111-8111-111111111111';
  let version = 0;
  const writes: Record<string, unknown>[] = [];
  await page.route('**/api/auth/session', route => route.fulfill({ json: { data: { actor: { id: 'guardian', role: 'participant' } } } }));
  await page.route(`**/api/entries/${id}`, route => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON(); writes.push(body);
      return route.fulfill({ status: 409, json: { error: 'This draft changed in another tab. Reload before saving.' } });
    }
    return route.fulfill({ json: { data: {
      entry: { id, reference: 'YES-TEST', state: 'draft', canEdit: true, revision: 0, lock_version: version++, answers: { title: 'Saved title' }, memberIds: [] },
      competition: { title: 'Test challenge', guidelines: 'Test guidelines', config: { mode: 'individual', fields: [{ key: 'title', label: 'Title', type: 'text', required: true }], files: { minCount: 0, maxCount: 1, maxBytes: 10000, types: ['image/png'] } } }, assets: [], revisions: [],
    } } });
  });
  await page.goto(`/entries/${id}`);
  await page.getByLabel('Title (required)', { exact: true }).fill('Unsaved work');
  await page.getByRole('button', { name: 'Refresh file status', exact: true }).click();
  await expect(page.getByText('Refreshing file and entry status…')).toHaveCount(0);
  await expect(page.getByLabel('Title (required)', { exact: true })).toHaveValue('Unsaved work');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('This draft changed in another tab.');
  expect(writes).toEqual([{ answers: { title: 'Unsaved work' }, memberIds: [], lockVersion: 0 }]);
});

test('returning registration sends studentId and retains the chosen competition', async ({ page }) => {
  const studentId = '11111111-1111-4111-8111-111111111111';
  const editionId = '22222222-2222-4222-8222-222222222222';
  const schoolId = '33333333-3333-4333-8333-333333333333';
  const competitionId = '44444444-4444-4444-8444-444444444444';
  let submitted: Record<string, unknown> | undefined;
  await page.route('**/api/auth/session', route => route.fulfill({ json: { data: { actor: { id: 'guardian', role: 'participant', contact: '+919000000000' } } } }));
  await page.route('**/api/participant', route => route.fulfill({ json: { data: { students: [{ id: studentId, reference: 'STU-ONE', name: 'Returning student', participations: [{ edition_id: 'previous' }] }], schools: [], entries: [] } } }));
  await page.route('**/api/public/config', route => route.fulfill({ json: { data: {
    editions: [{ id: editionId, label: 'New edition', state: 'open', registration_opens: new Date(Date.now() - 86400000).toISOString(), registration_closes: new Date(Date.now() + 86400000).toISOString(), config: { registrationApproved: true, consentText: 'Approved guardian consent.', consentVersion: 'v1' } }],
    competitions: [{ id: competitionId }], content: [{ key: 'privacy', body: 'Approved privacy information' }, { key: 'terms', body: 'Approved terms' }],
  } } }));
  await page.route('**/api/public/schools?**', route => route.fulfill({ json: { data: { items: [{ id: schoolId, name: 'Test school', reference: 'SCH-ONE', city: 'Delhi', state: 'Delhi', postal_code: '110001' }], total: 1, page: 1, pageSize: 25 } } }));
  await page.route('**/api/students', route => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ json: { data: { student: { id: studentId, reference: 'STU-ONE' }, participation: { id: 'new-participation' } } } });
  });
  await page.goto(`/register?competitionId=${competitionId}`);
  await page.getByRole('button', { name: 'Select Test school', exact: true }).click();
  await page.getByLabel('Student name (required)', { exact: true }).fill('Another student');
  await page.getByLabel('Class (required)', { exact: true }).fill('9');
  await page.getByLabel('Section (optional)', { exact: true }).fill('B');
  await page.getByLabel('Emergency contact (optional)', { exact: true }).fill('+919000000001');
  await page.getByLabel('Student', { exact: true }).selectOption(studentId);
  await page.getByRole('button', { name: 'Select Test school', exact: true }).click();
  await expect(page.getByLabel('Student name (required)', { exact: true })).toHaveValue('Returning student');
  await expect(page.getByLabel('Class (required)', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Section (optional)', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Emergency contact (optional)', { exact: true })).toHaveValue('');
  await page.getByLabel('Class (required)', { exact: true }).fill('6');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Review registration', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm registration', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Student registration received' })).toBeVisible();
  expect(submitted).toMatchObject({ studentId, schoolId, editionId, class: 6, guardianContact: '+919000000000', consentVersion: 'v1', consent: true });
  await expect(page.getByRole('link', { name: 'Choose a competition' })).toHaveAttribute('href', `/dashboard?competitionId=${competitionId}`);
});

test('first-time dashboard retains its published competition when registering a student', async ({ page }) => {
  const competitionId = '44444444-4444-4444-8444-444444444444';
  await page.route('**/api/auth/session', route => route.fulfill({ json: { data: { actor: { id: 'guardian', role: 'participant' } } } }));
  await page.route('**/api/participant', route => route.fulfill({ json: { data: { students: [], schools: [], entries: [] } } }));
  await page.route('**/api/public/config', route => route.fulfill({ json: { data: { editions: [], competitions: [{ id: competitionId }], content: [] } } }));
  await page.goto(`/dashboard?competitionId=${competitionId}`);
  await expect(page.getByRole('link', { name: 'Register another student', exact: true })).toHaveAttribute('href', `/register?competitionId=${competitionId}`);
});
