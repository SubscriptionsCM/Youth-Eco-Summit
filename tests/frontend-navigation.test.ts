import { describe, expect, it } from 'vitest';
import { afterLoginPath, dashboardLabel, dashboardPath, loginPath, safeReturnPath } from '../src/components/auth-navigation';
import { catalogueCompetitions, competitionAvailability, competitionExcerpt, competitionPath, findProgrammeCompetition, findPublicCompetition } from '../src/components/competition-public';

describe('authenticated navigation', () => {
  it('preserves private team invitation and competition query values through login', () => {
    const destination = '/teams/join?token=private%2Btoken%2Fvalue&edition=2027#confirmation';
    const href = new URL(loginPath(destination), 'https://local.test');
    expect(href.pathname).toBe('/login');
    expect(href.searchParams.get('next')).toBe(destination);
    expect(afterLoginPath('participant', href.searchParams.get('next'))).toBe(destination);
    expect(afterLoginPath('participant', '/dashboard?competitionId=entry-choice')).toBe('/dashboard?competitionId=entry-choice');
    expect(afterLoginPath('participant', '/register?competitionId=entry-choice')).toBe('/register?competitionId=entry-choice');
  });

  it.each([
    'https://outside.test/steal', '//outside.test/steal', '/\\outside.test', '/%2foutside.test',
    '/%5coutside.test', '/%09outside.test', 'javascript:alert(1)', '/login?next=/register',
    '/api/auth/logout', '/invite?token=staff-secret', '/recover?token=reset-secret', '/bad%zz',
    '/\n/evil', '/a/../login', '', null,
  ])('rejects unsafe or looping destination %s', value => {
    expect(safeReturnPath(value)).toBeNull();
    expect(afterLoginPath('participant', value)).toBe('/dashboard');
  });

  it('returns each account to its own workspace if a destination requires another role', () => {
    expect(afterLoginPath('participant', '/admin/entries?id=entry')).toBe('/dashboard');
    expect(afterLoginPath('participant', '/judge/assignment')).toBe('/dashboard');
    expect(afterLoginPath('judge', '/admin')).toBe('/judge');
    expect(afterLoginPath('judge', '/entries/private-entry')).toBe('/judge');
    expect(afterLoginPath('admin', '/register?competitionId=one')).toBe('/admin');
    expect(afterLoginPath('admin', '/schools/register')).toBe('/admin');
    expect(afterLoginPath('owner', '/teams/join?token=one')).toBe('/admin');
    expect(afterLoginPath('admin', '/admin/entries?id=entry')).toBe('/admin/entries?id=entry');
    expect(afterLoginPath('owner', '/judge/assignment')).toBe('/judge/assignment');
    expect(dashboardPath('judge')).toBe('/judge');
    expect(dashboardLabel('owner')).toBe('Administration');
  });
});

describe('public competition integration', () => {
  const now = Date.parse('2026-10-01T10:00:00Z');
  const editions = [{ id: 'edition-2027', state: 'open', label: '2027' }];
  const competition = { id: 'current-version', edition_id: 'edition-2027', slug: 'essay', status: 'approved', opens_at: '2026-10-01T09:00:00Z', closes_at: '2026-10-02T09:00:00Z', guidelines: 'Write an original essay about your environmental idea.' };

  it('keeps real published challenges while excluding local fixtures and archived editions from the catalogue', () => {
    const records = [
      { ...competition, title: 'Essay writing' },
      { ...competition, id: 'test-title', title: 'LOCAL TEST — Environmental ideas' },
      { ...competition, id: 'test-edition', edition_id: 'test-edition', title: 'Test challenge' },
      { ...competition, id: 'archived', edition_id: 'old-edition', title: 'Earlier programme' },
    ];
    expect(catalogueCompetitions(records, [...editions,
      { id: 'test-edition', label: 'LOCAL TEST edition fixture', state: 'open' },
      { id: 'old-edition', label: '2026', state: 'archived' },
    ])).toEqual([records[0]]);
  });

  it('uses unique record IDs and never guesses a reused edition/version slug', () => {
    const records = [{ ...competition, id: 'old-version' }, competition];
    expect(competitionPath(competition)).toBe('/competitions/current-version');
    expect(findPublicCompetition(records, 'current-version')).toBe(competition);
    expect(findPublicCompetition(records, 'essay')).toBeUndefined();
    expect(findPublicCompetition([competition], 'essay')).toBe(competition);
  });

  it('connects planned formats only to a unique approved record from 2027', () => {
    const otherEdition = { id: 'edition-2026', label: 'Youth Eco Summit 2026', state: 'open' };
    const old = { ...competition, id: 'old', edition_id: otherEdition.id };
    const draft = { ...competition, id: 'draft', status: 'draft' };
    expect(findProgrammeCompetition([old, draft, competition], [...editions, otherEdition], 'essay')).toBe(competition);
    expect(findProgrammeCompetition([old, draft], [...editions, otherEdition], 'essay')).toBeUndefined();
    expect(findProgrammeCompetition([competition, { ...competition, id: 'ambiguous' }], editions, 'essay')).toBeUndefined();
    expect(findProgrammeCompetition([competition], [{ ...editions[0], state: 'draft' }], 'essay')).toBeUndefined();
  });

  it('matches backend opening and closing boundary checks', () => {
    expect(competitionAvailability(competition, editions, now)).toEqual({ open: true, label: 'Open for entries' });
    expect(competitionAvailability(competition, editions, Date.parse(competition.opens_at))).toMatchObject({ open: true });
    expect(competitionAvailability(competition, editions, Date.parse(competition.closes_at))).toEqual({ open: false, label: 'Entries closed' });
    expect(competitionAvailability(competition, editions, Date.parse(competition.opens_at) - 1)).toEqual({ open: false, label: 'Opening soon' });
  });

  it('does not offer entry creation for a closed, unknown or archived edition', () => {
    for (const state of ['draft', 'closed', 'archived']) expect(competitionAvailability(competition, [{ ...editions[0], state }], now).open).toBe(false);
    expect(competitionAvailability(competition, [], now).open).toBe(false);
    expect(competitionAvailability({ ...competition, status: 'closed' }, editions, now).open).toBe(false);
    expect(competitionAvailability({ ...competition, closes_at: 'invalid' }, editions, now).label).toBe('Dates to be confirmed');
  });

  it('uses actual retained guidelines when the API has no summary field', () => {
    expect(competitionExcerpt(competition)).toBe(competition.guidelines);
    expect(competitionExcerpt({ guidelines: 'Approved\n\n  instructions.' })).toBe('Approved instructions.');
    const excerpt = competitionExcerpt({ guidelines: 'long '.repeat(100) });
    expect(excerpt.length).toBeLessThanOrEqual(220);
    expect(excerpt.endsWith('…')).toBe(true);
  });
});
