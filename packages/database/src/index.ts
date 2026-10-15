import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

export type DatabaseClient = ReturnType<typeof createDatabaseClient>;

export function createDatabaseClient(connectionString: string) {
  const pool = new Pool({ connectionString });
  return { db: drizzle(pool), pool };
}

export async function checkDatabase(pool: Pool): Promise<void> {
  await pool.query('select 1');
}
