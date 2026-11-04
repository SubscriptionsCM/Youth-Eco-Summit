import { db } from '../src/server/db';
import { AppError, type Actor } from '../src/server/core';
import { importHistoricalFile } from '../src/server/historical-files';

// Run only from an authorized organizer environment with database/storage credentials.
// Positional arguments are source reference UUID, local original path, active owner contact.
const [fileRefId,localPath,ownerContact,...extra] = process.argv.slice(2);
try {
  if (!fileRefId || !localPath || !ownerContact || extra.length) throw new AppError(400,'Usage: npx tsx scripts/import-file.ts <fileRefId> <local-original-path> <owner-contact>');
  if (!process.env.DATABASE_URL) throw new AppError(503,'Configure DATABASE_URL and the private storage/scanner environment first');
  const user = (await db.query("SELECT id,role FROM users WHERE contact=$1 AND role='owner' AND active",[ownerContact])).rows[0];
  if (!user) throw new AppError(403,'An active owner account is required');
  const result = await importHistoricalFile(db,user as Actor,{fileRefId,localPath});
  console.log(JSON.stringify(result));
  process.exit(result.status === 'ready' ? 0 : 1);
} catch (error) {
  console.error(error instanceof AppError ? error.message : 'Historical file repair failed. Check source availability, storage/scanner configuration, and the repair job status before retrying.');
  process.exit(1);
}
