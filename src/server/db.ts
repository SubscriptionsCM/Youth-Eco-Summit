import pg from 'pg';
export interface Db {
  query<T = Record<string, any>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  transaction<T>(fn: (db: Db) => Promise<T>): Promise<T>;
}
const globalDb = globalThis as unknown as { yesPool?: pg.Pool };
function pool() { return globalDb.yesPool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined }); }
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
