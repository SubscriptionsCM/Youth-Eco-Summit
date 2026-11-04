import { PGlite } from '@electric-sql/pglite';
import { readFile,readdir } from 'node:fs/promises';
import type { Db } from '../../src/server/db';
export async function testDb() {
  // Release closed WebAssembly instances between isolated fixtures on small machines.
  global.gc?.();
  let pg: PGlite | undefined = new PGlite();
  for (const name of (await readdir('migrations')).filter(x=>x.endsWith('.sql')).sort()) await pg.exec(await readFile(`migrations/${name}`,'utf8'));
  const wrap = (getClient:()=>any): Db => ({ query: (sql,params=[])=>getClient().query(sql,params), transaction: fn=>getClient().transaction((tx:any)=>fn(wrap(()=>tx))) });
  return { db: wrap(()=>{if(!pg)throw new Error('Test database is closed');return pg;}), close: async()=>{const closing=pg;pg=undefined;await closing?.close();} };
}
