import pg from 'pg';
export interface Db {
  query<T = Record<string, any>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  transaction<T>(fn: (db: Db) => Promise<T>): Promise<T>;
}
const globalDb = globalThis as unknown as { yesPool?: pg.Pool };
function pool() {
 const tls=process.env.DATABASE_SSL==='true';
 let connectionString=process.env.DATABASE_URL;
 if(tls&&connectionString){const url=new URL(connectionString);for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(key);connectionString=url.toString();}
 return globalDb.yesPool ??= new pg.Pool({ connectionString, max:Math.max(1,Math.min(10,Number(process.env.DATABASE_POOL_MAX)||3)),idleTimeoutMillis:10000,connectionTimeoutMillis:10000,
 ssl:tls?{rejectUnauthorized:true,...process.env.DATABASE_CA_CERT?{ca:process.env.DATABASE_CA_CERT.replace(/\\n/g,'\n')}:{}}:undefined });
}
function adapter(client: pg.Pool | pg.PoolClient): Db {
  return {
    async query<T>(text: string, params: unknown[] = []) { const result = await client.query(text, params); return { rows: result.rows as T[] }; },
    async transaction<T>(fn: (db: Db) => Promise<T>) {
      const connection = 'connect' in client ? await (client as pg.Pool).connect() : client as pg.PoolClient;
      try { await connection.query('BEGIN'); const result = await fn(adapter(connection)); await connection.query('COMMIT'); return result; }
      catch (error) { await connection.query('ROLLBACK'); throw error; }
      finally { if ('connect' in client) connection.release(); }
    }
  };
}
export const db: Db = { query: (text, params) => adapter(pool()).query(text, params), transaction: fn => adapter(pool()).transaction(fn) };
