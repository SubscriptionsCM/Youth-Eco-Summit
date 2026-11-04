import { pathToFileURL } from 'node:url';
import { db, type Db } from '../src/server/db';
import { id } from '../src/server/core';
import { participationWindow } from '../src/data/participation-window';
import { competitionGuidelines2027 } from '../src/data/guidelines-2027';
import { validateLocalEnvironment } from './local-config.mjs';

const editionLabel = 'Youth Eco Summit 2027';
const sourceKeys = new Set(['yes-2027-supplied-guidelines-v2', 'yes-2027-craft-classes-confirmed-v3', 'yes-2027-ai-deduction-confirmed-v4']);
function iso(value: unknown) { return value ? new Date(String(value)).toISOString() : null; }

/** Confirm programme dates only; do not invent consent, team policy or form approval. */
export async function configure2027Window(database: Db) {
 return database.transaction(async tx => {
  const { rows: editions } = await tx.query('SELECT * FROM editions WHERE label=$1 FOR UPDATE', [editionLabel]);
  if (editions.length !== 1) throw new Error('Exactly one 2027 edition is required. Import or reconcile the programme before setting its dates.');
  const edition = editions[0];
  if (edition.state === 'archived') throw new Error('The 2027 edition is archived; its dates were not changed.');
  const { rows: competitions } = await tx.query('SELECT * FROM competitions WHERE edition_id=$1 ORDER BY slug,version DESC FOR UPDATE', [edition.id]);
  const latest = new Map<string, typeof competitions[number]>();
  for (const competition of competitions) if (!latest.has(competition.slug)) latest.set(competition.slug, competition);
  const expected = new Set(competitionGuidelines2027.map(item => item.slug));
  for (const slug of expected) {
   const competition = latest.get(slug);
   if (!competition || !sourceKeys.has(competition.config?.provenance?.importKey)) throw new Error(`The latest ${slug} form is not a supplied-guideline draft. No dates were changed; review it separately.`);
  }
  // Preserve earlier draft rules. Any already-published version also receives the
  // programme cutoff, so an old link cannot accept late submissions.
  const targeted = competitions.filter(c => c.status === 'approved' || (latest.get(c.slug)?.id === c.id && expected.has(c.slug)));
  const changed = targeted.filter(c => iso(c.opens_at) !== participationWindow.opensAt || iso(c.closes_at) !== participationWindow.closesAt);
  const editionChanged = iso(edition.registration_opens) !== participationWindow.opensAt || iso(edition.registration_closes) !== participationWindow.closesAt;
  if (editionChanged) await tx.query('UPDATE editions SET registration_opens=$2,registration_closes=$3,updated_at=now() WHERE id=$1', [edition.id, participationWindow.opensAt, participationWindow.closesAt]);
  for (const competition of changed) await tx.query('UPDATE competitions SET opens_at=$2,closes_at=$3 WHERE id=$1', [competition.id, participationWindow.opensAt, participationWindow.closesAt]);
  if (editionChanged || changed.length) await tx.query('INSERT INTO audit_events(id,action,entity_type,entity_id,detail) VALUES($1,$2,$3,$4,$5)', [id(), 'programme.confirm_dates', 'editions', edition.id, JSON.stringify({
   source: 'User confirmed on 6 October 2026 that registrations and submissions are currently open and close on 5 November. Opening follows the previously confirmed 1 October launch. End-of-day Asia/Kolkata cutoff is the stated implementation assumption.',
   opensAt: participationWindow.opensAt, closesAt: participationWindow.closesAt, timezone: participationWindow.timezone,
   previousRegistrationDates: { opensAt: iso(edition.registration_opens), closesAt: iso(edition.registration_closes) },
   changedCompetitionDates: changed.map(c => ({ id: c.id, slug: c.slug, version: c.version, opensAt: iso(c.opens_at), closesAt: iso(c.closes_at) })),
   unchanged: ['edition state', 'consent wording and approval', 'competition rules and status', 'historical drafts', 'summit date'],
  })]);
  return { editionId: edition.id, editionChanged, competitionsUpdated: changed.length, competitionsPreserved: targeted.length - changed.length, opensAt: participationWindow.opensAt, closesAt: participationWindow.closesAt,
   registrationConfigured: Boolean(edition.config?.registrationApproved && edition.config?.consentText && edition.config?.consentVersion), editionState: edition.state,
   message: 'Confirmed dates saved. Consent, edition activation and competition approvals were preserved.' };
 });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 try { validateLocalEnvironment(process.env); console.log(JSON.stringify(await configure2027Window(db), null, 2)); process.exit(0); }
 catch (error) { console.error(error instanceof Error && !('code' in error) ? error.message : 'Date configuration failed. Check the local runtime.'); process.exit(1); }
}
