import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Student from '../src/app/register/page';
import * as Teacher from '../src/app/teachers/register/page';
import * as School from '../src/app/schools/register/page';
import * as Partner from '../src/app/partners/enquire/page';
import * as Dashboard from '../src/app/dashboard/page';
import * as Login from '../src/app/login/page';

const pages = [
  { name: 'student registration', page: Student, referenceComponent: 'ReferenceFormPage', formKey: 'student' },
  { name: 'educator registration', page: Teacher, referenceComponent: 'ReferenceFormPage', formKey: 'teacher' },
  { name: 'school registration', page: School, referenceComponent: 'ReferenceFormPage', formKey: 'school' },
  { name: 'partner enquiry', page: Partner, referenceComponent: 'ReferenceFormPage', formKey: 'partner' },
  { name: 'participant dashboard', page: Dashboard, referenceComponent: 'ReferenceDashboard', formKey: undefined },
];

afterEach(() => vi.unstubAllEnvs());

describe('runtime form-provider configuration', () => {
  it('selects the login provider at request time', () => {
    expect((Login as { dynamic?: string }).dynamic).toBe('force-dynamic');
  });
  it.each(['wordpress','supabase',''])('preserves the %s login entry point', provider => {
    vi.stubEnv('AUTH_PARTICIPANT_PROVIDER',provider);
    expect(Login.default().type.name).toBe(provider==='supabase'?'ReferenceLogin':'LoginPage');
  });
  it.each(pages)('renders $name at request time', ({ page }) => {
    expect((page as { dynamic?: string }).dynamic).toBe('force-dynamic');
  });

  it.each(pages)('selects the configured reference flow for $name', ({ page, referenceComponent, formKey }) => {
    vi.stubEnv('PORTAL_REFERENCE_FORMS', 'true');
    const element = page.default();
    expect(element.type.name).toBe(referenceComponent);
    if (formKey) expect(element.props.formKey).toBe(formKey);
  });

  it.each(pages)('preserves the legacy flow for $name', ({ page, referenceComponent }) => {
    vi.stubEnv('PORTAL_REFERENCE_FORMS', 'false');
    expect(page.default().type.name).not.toBe(referenceComponent);
  });
});
