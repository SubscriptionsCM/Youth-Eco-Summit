import { expect, test } from '@playwright/test';

test('admin school and student details preserve edition crosslinks and show consent records', async ({ page }) => {
  await page.route('**/api/auth/session', route => route.fulfill({ json: { data: { actor: { id: 'admin-one', role: 'admin' } } } }));
  const school = {
    id: 'school-one', reference: 'SCH-ONE', name: 'Configured School', status: 'active', address: 'School address', city: 'City', state: 'State', registered_at: '2025-01-01T00:00:00Z',
    contacts: [{ id: 'contact-one', name: 'School Coordinator', role: 'coordinator', email: 'coordinator@example.test', phone: '+919000000001', verified_at: '2025-01-01T00:00:00Z' }],
    participations: [{ id: 'school-participation-one', edition_id: 'edition-one', edition_label: 'Configured edition', student_count: 2, entry_count: 3 }],
  };
  const student = {
    id: 'student-one', name: 'Registered Student', reference: 'STU-ONE', guardian_contact: '+919000000002',
    participations: [{ id: 'participation-one', edition_id: 'edition-one', edition_label: 'Configured edition', school_id: 'school-one', school_name: 'Configured School', class: 8, section: 'A' }],
    entries: [{ id: 'entry-one', reference: 'YES-ONE', title: 'Configured activity', edition_label: 'Configured edition', participation_role: 'member', state: 'submitted', submitted_at: '2026-01-01T00:00:00Z' }],
    consents: [{ id: 'consent-one', edition_label: 'Configured edition', purpose: 'participation', wording_version: 'v1', wording: 'Approved participation wording.', accepted: true, actor_name: 'Verified Guardian', created_at: '2026-01-01T00:00:00Z' }],
    contact_verifications: [{ id: 'verification-one', contact: '+919000000002', method: 'otp', verified_at: '2026-01-01T00:00:00Z' }],
  };
  await page.route('**/api/admin/schools?**', route => route.fulfill({ json: { data: { items: [school], total: 1, page: 1, pageSize: 25 } } }));
  await page.route('**/api/admin/students?**', route => {
    const params = new URL(route.request().url()).searchParams;
    const correctScope = params.get('schoolId') === 'school-one' && params.get('editionId') === 'edition-one';
    return route.fulfill({ json: { data: { items: correctScope ? [student] : [], total: correctScope ? 1 : 0, page: 1, pageSize: 25 } } });
  });
  await page.goto('/admin/schools?id=school-one');
  await expect(page.getByRole('heading', { name: 'Annual participation' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'coordinator@example.test' })).toBeVisible();
  await page.getByRole('link', { name: '2 students', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/students\?schoolId=school-one&editionId=edition-one/);
  await page.getByRole('button', { name: 'View details', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Registered Student', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Consent records' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Verified account contacts' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'YES-ONE' })).toHaveAttribute('href', '/entries/entry-one');
  await expect(page.getByRole('cell', { name: 'Team member', exact: true })).toBeVisible();
  await page.getByText('Recorded consent wording', { exact: true }).click();
  await expect(page.getByText('Approved participation wording.', { exact: true })).toBeVisible();
});

test('judge empty queue and revoked assignment expose no private records', async ({ page }) => {
  await page.route('**/api/auth/session', route => route.fulfill({ json: { data: { actor: { id: 'judge-one', role: 'judge' } } } }));
  await page.route('**/api/judge?**', route => route.fulfill({ json: { data: { items: [], total: 0, page: 1, pageSize: 25 } } }));
  await page.route('**/api/judge/revoked-assignment', route => route.fulfill({ status: 404, json: { error: 'Active assignment not found.' } }));
  await page.goto('/judge');
  await expect(page.getByText('No entries match your current assignments and filters.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open review' })).toHaveCount(0);
  await page.goto('/judge/revoked-assignment');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Active assignment not found.');
  await expect(page.getByRole('button', { name: 'Save review draft' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Download original file' })).toHaveCount(0);
});

test('judge assigned detail displays its rubric and saves only that review draft', async ({ page }) => {
  await page.route('**/api/auth/session', route => route.fulfill({ json: { data: { actor: { id: 'judge-one', role: 'judge' } } } }));
  let review: Record<string, unknown> | null = null;
  const draftRequests: Record<string, unknown>[] = [];
  await page.route('**/api/judge/assignment-one', async route => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      draftRequests.push(body);
      review = { id: 'review-one', status: 'draft', scores: body.scores, comment: body.comment, lock_version: 1 };
      return route.fulfill({ json: { data: review } });
    }
    return route.fulfill({ json: { data: { entry: { id: 'entry-one', reference: 'YES-ONE', guidelines: 'Configured judging instructions.', guardian_contact: 'private-guardian@example.test' }, assignment: { id: 'assignment-one', revision: 1 }, revision: { version: 1, answers: { response: 'Submitted response.' } }, assets: [], review, round: { id: 'round-one', name: 'Configured round', kind: 'scoring', decision_roles: [], rubric: { criteria: [{ id: 'clarity', label: 'Clarity', min: 0, max: 10, required: true }], commentRequired: true } } } } });
  });
  await page.goto('/judge/assignment-one');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Review YES-ONE');
  await expect(page.getByText('Submitted response.', { exact: true })).toBeVisible();
  await page.getByLabel('Clarity (required)', { exact: true }).fill('8');
  await page.getByLabel('Review comments (required)', { exact: true }).fill('Clear explanation of the submitted work.');
  await page.getByRole('button', { name: 'Save review draft', exact: true }).click();
  await expect(page.getByText('Review draft saved.', { exact: true })).toBeVisible();
  expect(draftRequests).toEqual([{ scores: { clarity: 8 }, comment: 'Clear explanation of the submitted work.', lockVersion: 0 }]);
  await expect(page.getByText('private-guardian@example.test', { exact: false })).toHaveCount(0);
});
