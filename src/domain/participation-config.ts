import type { ParticipationTiming } from '../data/participation-window';

/** Share the same projection between the public API and already-open client pages. */
export function applyParticipationWindow<T extends {editions:Record<string,any>[];competitions:Record<string,any>[]}>(config:T,window:Pick<ParticipationTiming,'closesAt'>,managed:boolean):T {
 if(!managed)return config;
 const active=new Set(config.editions.filter(edition=>edition.state==='open').map(edition=>edition.id));
 return {...config,
  editions:config.editions.map(edition=>active.has(edition.id)?{...edition,registration_closes:window.closesAt}:edition),
  competitions:config.competitions.map(competition=>active.has(competition.edition_id)?{...competition,closes_at:window.closesAt}:competition),
 };
}
