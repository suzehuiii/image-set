import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

export * from './schema.js';

export type DatabaseClient = ReturnType<typeof createDatabaseClient>;

export function createDatabaseClient(connectionString: string) {
  const pool = new Pool({ connectionString });
  return { db: drizzle(pool), pool };
}

export async function checkDatabase(pool: Pool): Promise<void> {
  await pool.query('select 1');
}

export async function migrateDatabase(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock(20261016)');
    await client.query(`
      create table if not exists schema_migrations (
        version integer primary key,
        applied_at timestamptz not null default now()
      )
    `);
    const result = await client.query<{ version: number }>(
      'select version from schema_migrations where version = 1',
    );
    if (result.rowCount === 0) {
      await client.query(`
        create table users (
          id uuid primary key,
          email varchar(320) not null unique,
          password_hash text not null,
          display_name varchar(80) not null,
          credit_balance integer not null default 50 check (credit_balance >= 0),
          status varchar(20) not null default 'active' check (status in ('active', 'disabled')),
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        );
        create table auth_sessions (
          id uuid primary key,
          user_id uuid not null references users(id) on delete cascade,
          token_hash char(64) not null unique,
          expires_at timestamptz not null,
          created_at timestamptz not null default now()
        );
        create index auth_sessions_user_id_idx on auth_sessions(user_id);
        create index auth_sessions_expires_at_idx on auth_sessions(expires_at);
        create table projects (
          id uuid primary key,
          user_id uuid not null references users(id) on delete cascade,
          name varchar(120) not null,
          target_platform varchar(30) not null default 'amazon_us',
          target_locale varchar(20) not null default 'en-US',
          product_category varchar(100),
          product_brief jsonb not null default '{}'::jsonb,
          analysis_result jsonb,
          status varchar(30) not null default 'draft' check (status in ('draft', 'analyzing', 'ready', 'generating', 'completed', 'failed')),
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          deleted_at timestamptz
        );
        create index projects_user_updated_idx on projects(user_id, updated_at desc) where deleted_at is null;
        create table assets (
          id uuid primary key,
          project_id uuid not null references projects(id) on delete cascade,
          owner_user_id uuid not null references users(id) on delete cascade,
          asset_type varchar(20) not null check (asset_type in ('product', 'reference', 'generated', 'export')),
          image_role varchar(20) check (image_role in ('main', 'feature', 'lifestyle', 'detail')),
          object_key text not null unique,
          original_name varchar(255) not null,
          mime_type varchar(40) not null,
          width integer not null check (width > 0),
          height integer not null check (height > 0),
          file_size integer not null check (file_size > 0),
          checksum char(64) not null,
          status varchar(20) not null default 'ready' check (status in ('uploading', 'ready', 'failed', 'deleted')),
          qa_result jsonb,
          created_at timestamptz not null default now(),
          deleted_at timestamptz
        );
        create index assets_project_type_idx on assets(project_id, asset_type) where deleted_at is null;
      `);
      await client.query('insert into schema_migrations(version) values (1)');
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
