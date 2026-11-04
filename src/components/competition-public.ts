import type { Row } from './api';

/** Local integration fixtures remain available to the test dashboard, not the public programme. */
export function catalogueCompetitions(competitions: Row[], editions: Row[]): Row[] {
  return competitions.filter(competition => {
    const edition = editions.find(item => item.id === (competition.edition_id || competition.editionId));
    const localFixture = /^LOCAL TEST\b/.test(String(competition.title || '')) || /^LOCAL TEST\b/.test(String(edition?.label || ''));
    return !localFixture && edition?.state !== 'archived';
  });
}

export function competitionPath(competition: Row): string {
  return `/competitions/${encodeURIComponent(competition.id)}`;
}

/** Only attach rules to a planned format when one published 2027 record matches. */
export function findProgrammeCompetition(competitions: Row[], editions: Row[], slug: string): Row | undefined {
  const candidates = catalogueCompetitions(competitions, editions).filter(competition => {
    const edition = editions.find(item => item.id === (competition.edition_id || competition.editionId));
    return competition.slug === slug && competition.status === 'approved' &&
      edition?.state !== 'draft' && /\b2027\b/.test(String(edition?.label || ''));
  });
  return candidates.length === 1 ? candidates[0] : undefined;
}

export function competitionAvailability(competition: Row, editions: Row[], now = Date.now()): { open: boolean; label: string } {
  const edition = editions.find(item => item.id === (competition.edition_id || competition.editionId));
  const opens = Date.parse(competition.opens_at || competition.opensAt || '');
  const closes = Date.parse(competition.closes_at || competition.closesAt || '');
  if (competition.status !== 'approved' || edition?.state !== 'open') return { open: false, label: 'Entries closed' };
  if (!Number.isFinite(opens) || !Number.isFinite(closes)) return { open: false, label: 'Dates to be confirmed' };
  if (now < opens) return { open: false, label: 'Opening soon' };
  if (now >= closes) return { open: false, label: 'Entries closed' };
  return { open: true, label: 'Open for entries' };
}

export function competitionExcerpt(competition: Row): string {
  const text = String(competition.summary || competition.description || competition.guidelines || '').replace(/\s+/g, ' ').trim();
  return text.length > 220 ? `${text.slice(0, 217).trimEnd()}…` : text;
}

export function findPublicCompetition(competitions: Row[], id: string): Row | undefined {
  const exact = competitions.find(item => item.id === id);
  if (exact) return exact;
  const legacy = competitions.filter(item => item.slug === id);
  // A slug can be reused across editions and versions; never guess a record.
  return legacy.length === 1 ? legacy[0] : undefined;
}
