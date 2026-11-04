import { describe, expect, it } from 'vitest';
import { eligibleCompetitions, initialEntrySelection, studentRegisteredFor } from '../src/components/participant-options';

const now = Date.parse('2026-10-15T12:00:00Z');
const editions = [{ id: 'current', state: 'open' }, { id: 'archive', state: 'archived' }];
const junior = { id: 'p-junior', edition_id: 'current', class: 5 };
const senior = { id: 'p-senior', edition_id: 'current', class: 10 };
const challenge = { id: 'junior', edition_id: 'current', status: 'approved', opens_at: '2026-10-01T00:00:00Z', closes_at: '2026-11-01T00:00:00Z', config: { categories: [{ classes: [4, 5, 6] }] } };

describe('participant choices use the backend edition and class rules', () => {
  it('shows only open, approved challenges in the matching edition and class category', () => {
    const items = [challenge, { ...challenge, id: 'draft', status: 'draft' }, { ...challenge, id: 'other-edition', edition_id: 'archive' }, { ...challenge, id: 'future', opens_at: '2026-12-01' }, { ...challenge, id: 'closed', closes_at: '2026-10-15T12:00:00Z' }, { ...challenge, id: 'invalid', opens_at: null }];
    expect(eligibleCompetitions(junior, items, editions, now).map(item => item.id)).toEqual(['junior']);
    expect(eligibleCompetitions(senior, items, editions, now)).toEqual([]);
    expect(eligibleCompetitions(junior, items, [{ id: 'current', state: 'archived' }], now)).toEqual([]);
  });
  it('preserves a competition CTA selection and chooses an eligible student registration', () => {
    const seniorChallenge = { ...challenge, id: 'senior', config: { categories: [{ classes: [10, 11, 12] }] } };
    expect(initialEntrySelection([junior, senior], [challenge, seniorChallenge], editions, 'senior', now)).toEqual({ participationId: 'p-senior', competitionId: 'senior' });
  });
  it('does not select an unavailable competition from a stale or manipulated query', () => {
    expect(initialEntrySelection([junior], [challenge], editions, 'missing', now)).toEqual({ participationId: 'p-junior', competitionId: 'junior' });
    expect(initialEntrySelection([senior], [challenge], editions, 'junior', now)).toEqual({ participationId: 'p-senior', competitionId: '' });
  });
  it('distinguishes existing edition participation without matching siblings by name', () => {
    const first = { id: 'first', name: 'Same name', participations: [{ edition_id: 'current' }] };
    const second = { id: 'second', name: 'Same name', participations: [] };
    expect(studentRegisteredFor(first, 'current')).toBe(true);
    expect(studentRegisteredFor(first, 'next')).toBe(false);
    expect(studentRegisteredFor(second, 'current')).toBe(false);
  });
});
