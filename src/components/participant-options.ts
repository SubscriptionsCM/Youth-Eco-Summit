import type { Row } from './api';

export function eligibleCompetitions(participation: Row | undefined, competitions: Row[], editions: Row[], now = Date.now()): Row[] {
  if (!participation) return [];
  const editionId = participation.edition_id || participation.editionId;
  if (!editions.some(edition => edition.id === editionId && edition.state === 'open')) return [];
  return competitions.filter(competition => {
    const opens = Date.parse(competition.opens_at || competition.opensAt || '');
    const closes = Date.parse(competition.closes_at || competition.closesAt || '');
    return (competition.edition_id || competition.editionId) === editionId
      && competition.status === 'approved' && opens <= now && closes > now
      && competition.config?.categories?.some((category: Row) => category.classes?.includes(Number(participation.class ?? participation.class_number)));
  });
}

export function studentRegisteredFor(student: Row, editionId: string): boolean {
  return (student.participations || []).some((participation: Row) => (participation.edition_id || participation.editionId) === editionId);
}

export function initialEntrySelection(participations: Row[], competitions: Row[], editions: Row[], requestedCompetitionId = '', now = Date.now()) {
  const eligible = (participation: Row) => eligibleCompetitions(participation, competitions, editions, now);
  const participation = participations.find(item => eligible(item).some(competition => competition.id === requestedCompetitionId))
    || participations.find(item => eligible(item).length) || participations[0];
  const available = participation ? eligible(participation) : [];
  return { participationId: participation?.id || '', competitionId: available.find(item => item.id === requestedCompetitionId)?.id || available[0]?.id || '' };
}
