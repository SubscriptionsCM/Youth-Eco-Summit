import { describe, it, expect } from 'vitest';
import { daysUntilSummit } from '../src/data/summit-date';
describe('summit calendar countdown', () => {
  it('changes on the Indian calendar date, not the viewer time zone', () => {
    expect(daysUntilSummit(new Date('2027-01-28T18:29:59Z'))).toBe(1);
    expect(daysUntilSummit(new Date('2027-01-28T18:30:00Z'))).toBe(0);
    expect(daysUntilSummit(new Date('2027-01-29T18:29:59Z'))).toBe(0);
    expect(daysUntilSummit(new Date('2027-01-29T18:30:00Z'))).toBe(-1);
  });
  it('counts calendar days without inventing a summit start time', () => {
    expect(daysUntilSummit(new Date('2026-10-05T10:00:00Z'))).toBe(116);
  });
});
