import { readFile,readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { db } from '../src/server/db';
if(!process.env.DATABASE_URL)throw new Error('Set DATABASE_URL before running migrations.');
await db.query('CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
for(const name of (await readdir('migrations')).filter(x=>x.endsWith('.sql')).sort()){
 const sql=await readFile(`migrations/${name}`,'utf8'),checksum=createHash('sha256').update(sql).digest('hex');
 await db.transaction(async tx=>{
  await tx.query('LOCK TABLE schema_migrations IN EXCLUSIVE MODE');
  const {rows:[old]}=await tx.query('SELECT checksum FROM schema_migrations WHERE name=$1',[name]);
  if(old){if(old.checksum!==checksum)throw new Error(`Applied migration was changed: ${name}`);return;}
  await tx.query(sql);await tx.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',[name,checksum]);console.log(`Applied ${name}`);
 });
}
process.exit(0);
