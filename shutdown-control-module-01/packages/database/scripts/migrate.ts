import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool } from 'pg';

const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('MIGRATION_DATABASE_URL is required');
const pool = new Pool({ connectionString: url });
await pool.query('CREATE TABLE IF NOT EXISTS _migrations (id text primary key, checksum text not null, applied_at timestamptz not null default now())');
for (const file of (await readdir(new URL('../migrations/', import.meta.url))).filter((x) => x.endsWith('.up.sql')).sort()) {
  const sql = await readFile(join(new URL('../migrations/', import.meta.url).pathname, file), 'utf8'); const checksum = createHash('sha256').update(sql).digest('hex');
  const existing = await pool.query<{ checksum: string }>('SELECT checksum FROM _migrations WHERE id=$1', [file]);
  if (existing.rowCount) { if (existing.rows[0]?.checksum !== checksum) throw new Error(`migration checksum mismatch: ${file}`); continue; }
  const client = await pool.connect(); try { await client.query('BEGIN'); await client.query(sql); await client.query('INSERT INTO _migrations(id,checksum) VALUES($1,$2)', [file, checksum]); await client.query('COMMIT'); } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}
await pool.end();
