import { pathToFileURL } from 'node:url';
import { db, type Db } from '../src/server/db';
import { id } from '../src/server/core';
import { validateLocalEnvironment } from './local-config.mjs';

// Editorial reuse is authorized; 2026 result tracks are not 2027 eligibility rules.
const importKey = 'yes-2027-competition-drafts-from-2026-v1';
const editionLabel = 'Youth Eco Summit 2027';
const sourceUrl = 'https://youthecosummit.com/wp-content/uploads/2026/02/Final-Winner-sheet2026.pdf';
const formats = [
  ['essay', 'Essay'],
  ['article-writing', 'Article Writing'],
  ['blog-writing', 'Blog Writing'],
  ['short-film-making', 'Short Film Making'],
  ['spoken-word', 'Spoken Word (Monologue)'],
  ['painting', 'Painting'],
  ['waste-to-art', 'Waste to Art'],
  ['eco-business-model', 'Eco-Business Model'],
] as const;
const provenance = {
  importKey,
  sourceUrl,
  sourceEdition: 2026,
  targetEdition: 2027,
  sourceAudit: 'docs/current-competition-source-audit.md',
  authorization: 'User authorized reuse of the existing competition formats for the 2027 programme; submission rules remain unconfirmed.',
};

export async function import2027CompetitionDrafts(database: Db) {
  return database.transaction(async tx => {
    // Serialize concurrent reruns without changing any pre-existing record.
    await tx.query('LOCK TABLE editions, competitions IN SHARE ROW EXCLUSIVE MODE');
    const { rows: existingEditions } = await tx.query("SELECT * FROM editions WHERE label=$1 OR config->'provenance'->>'importKey'=$2", [editionLabel, importKey]);
    if (existingEditions.length > 1) throw new Error('More than one edition matches the 2027 import. No records were changed.');
    let edition = existingEditions[0];
    let editionCreated = false;
    if (edition && (edition.state !== 'draft' || edition.config?.provenance?.importKey !== importKey)) {
      throw new Error('A pre-existing 2027 edition is not this import’s draft. No records were changed.');
    }
    if (!edition) {
      [edition] = (await tx.query(
        "INSERT INTO editions(id,label,state,config) VALUES($1,$2,'draft',$3) RETURNING *",
        [id(), editionLabel, JSON.stringify({ registrationApproved: false, provenance })],
      )).rows;
      editionCreated = true;
    }

    const createdIds: string[] = [];
    for (const [slug, title] of formats) {
      const config = { provenance, reviewRequired: ['dates', 'guidelines', 'eligibility', 'entryLimits', 'teamRules', 'formFields', 'uploads'] };
      const { rows } = await tx.query(
        `INSERT INTO competitions(id,edition_id,slug,title,guidelines,status,opens_at,closes_at,version,config)
         VALUES($1,$2,$3,$4,$5,'draft',NULL,NULL,1,$6)
         ON CONFLICT(edition_id,slug,version) DO NOTHING RETURNING id`,
        [id(), edition.id, slug, title, 'Draft for Youth Eco Summit 2027. Format carried forward from the official 2026 results at the user’s request. The organizer must confirm 2027 guidelines, dates, eligibility and submission requirements before entries open.', JSON.stringify(config)],
      );
      if (rows[0]) createdIds.push(rows[0].id);
    }
    const { rows: competitions } = await tx.query(
      'SELECT id,slug,title,status,opens_at,closes_at FROM competitions WHERE edition_id=$1 AND slug=ANY($2::text[]) AND version=1 ORDER BY slug',
      [edition.id, formats.map(([slug]) => slug)],
    );
    if (editionCreated || createdIds.length) {
      await tx.query(
        'INSERT INTO audit_events(id,action,entity_type,entity_id,detail) VALUES($1,$2,$3,$4,$5)',
        [id(), 'programme.import_drafts', 'editions', edition.id, JSON.stringify({ ...provenance, editionCreated, createdCompetitionIds: createdIds })],
      );
    }
    return { editionId: edition.id, editionCreated, created: createdIds.length, preserved: formats.length - createdIds.length, competitions };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    validateLocalEnvironment(process.env);
    const result = await import2027CompetitionDrafts(db);
    console.log(JSON.stringify({ ...result, message: 'Only drafts were inserted. Existing records were preserved; no dates or submission rules were invented and nothing was approved or opened.' }, null, 2));
    process.exit(0);
  } catch (error) {
    // Avoid logging connection URLs, credentials or driver error objects.
    console.error(error instanceof Error && !('code' in error) ? error.message : 'Draft import failed. Check local services, migrations and existing programme records.');
    process.exit(1);
  }
}
