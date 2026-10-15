import { Pool, type PoolClient } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

export type Db = Pool;
export const createPool = (connectionString = process.env.DATABASE_URL): Pool => {
  if (!connectionString) throw new Error('DATABASE_URL is required');
  return new Pool({ connectionString, max: 20, application_name: 'shutdown-api' });
};
export const createDrizzle = (pool: Pool) => drizzle(pool);
export async function transaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>, isolation: 'READ COMMITTED' | 'REPEATABLE READ' = 'READ COMMITTED'): Promise<T> {
  const client = await pool.connect();
  try { await client.query(`BEGIN ISOLATION LEVEL ${isolation}`); const value = await fn(client); await client.query('COMMIT'); return value; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
export const q = async <T extends import('pg').QueryResultRow>(client: Pool | PoolClient, text: string, values: readonly unknown[] = []) => (await client.query<T>(text, [...values])).rows;
