import { bootstrapOwner } from '../src/server/auth';
import { db } from '../src/server/db';

async function main() {
  const contact = process.env.BOOTSTRAP_OWNER_CONTACT;
  const password = process.env.BOOTSTRAP_OWNER_PASSWORD;
  const secret = process.env.AUTH_SECRET;
  if (!process.env.DATABASE_URL || !contact || !password || !secret) throw new Error('Set DATABASE_URL, AUTH_SECRET, BOOTSTRAP_OWNER_CONTACT, and BOOTSTRAP_OWNER_PASSWORD in a secure local shell.');
  const result = await bootstrapOwner(db, { contact, password, secret, name: process.env.BOOTSTRAP_OWNER_NAME || 'Owner' });
  process.stdout.write('Owner created. Enroll this URI in the owner authenticator, then clear this terminal output and the bootstrap password environment variable. Do not save or share it.\n');
  process.stdout.write(`${result.provisioningUri}\n`);
}

main().then(() => process.exit(0)).catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Owner setup failed.'}\n`);
  process.exit(1);
});
