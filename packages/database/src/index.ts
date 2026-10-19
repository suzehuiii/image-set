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
    const versionTwo = await client.query<{ version: number }>(
      'select version from schema_migrations where version = 2',
    );
    if (versionTwo.rowCount === 0) {
      await client.query(`
        create table generation_jobs (
          id uuid primary key,
          project_id uuid not null references projects(id) on delete cascade,
          user_id uuid not null references users(id) on delete cascade,
          job_type varchar(20) not null check (job_type in ('analysis', 'image', 'review', 'export')),
          image_role varchar(20) check (image_role in ('main', 'feature', 'lifestyle', 'detail')),
          status varchar(20) not null check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
          provider varchar(40) not null,
          model varchar(100) not null,
          prompt_version varchar(40) not null,
          idempotency_key varchar(120) not null,
          input_snapshot jsonb not null default '{}'::jsonb,
          result_asset_id uuid references assets(id) on delete set null,
          credits_reserved integer not null default 0 check (credits_reserved >= 0),
          attempt_count integer not null default 0 check (attempt_count >= 0),
          error_code varchar(80),
          error_message_safe varchar(500),
          started_at timestamptz,
          completed_at timestamptz,
          created_at timestamptz not null default now(),
          unique(user_id, idempotency_key)
        );
        create index generation_jobs_project_created_idx on generation_jobs(project_id, created_at desc);
        create index generation_jobs_status_idx on generation_jobs(status, created_at);

        create table credit_ledger (
          id uuid primary key,
          user_id uuid not null references users(id) on delete cascade,
          job_id uuid references generation_jobs(id) on delete set null,
          entry_type varchar(20) not null check (entry_type in ('grant', 'reserve', 'consume', 'refund', 'adjustment')),
          delta integer not null,
          balance_after integer not null check (balance_after >= 0),
          idempotency_key varchar(180) not null unique,
          description varchar(255) not null,
          created_at timestamptz not null default now()
        );
        create index credit_ledger_user_created_idx on credit_ledger(user_id, created_at desc);

        insert into credit_ledger(id, user_id, entry_type, delta, balance_after, idempotency_key, description)
        select md5(id::text || ':initial-grant')::uuid, id, 'grant', credit_balance, credit_balance,
               'registration-grant:' || id::text, '首次注册赠送'
        from users
        on conflict (idempotency_key) do nothing;
      `);
      await client.query('insert into schema_migrations(version) values (2)');
    }
    const versionThree = await client.query<{ version: number }>(
      'select version from schema_migrations where version = 3',
    );
    if (versionThree.rowCount === 0) {
      await client.query(`
        alter table generation_jobs
          add column progress integer not null default 0 check (progress between 0 and 100),
          add column stage varchar(30) not null default 'queued';
        create index generation_jobs_queued_idx
          on generation_jobs(status, job_type, created_at)
          where status in ('queued', 'running');
      `);
      await client.query('insert into schema_migrations(version) values (3)');
    }
    const versionFour = await client.query<{ version: number }>(
      'select version from schema_migrations where version = 4',
    );
    if (versionFour.rowCount === 0) {
      await client.query(`
        alter table assets drop constraint if exists assets_asset_type_check;
        alter table assets add constraint assets_asset_type_check
          check (asset_type in ('product', 'reference', 'manual', 'generated', 'export'));
        alter table assets alter column width drop not null;
        alter table assets alter column height drop not null;
        alter table assets drop constraint if exists assets_width_check;
        alter table assets drop constraint if exists assets_height_check;
        alter table assets add constraint assets_width_check check (width is null or width > 0);
        alter table assets add constraint assets_height_check check (height is null or height > 0);
        alter table assets add constraint assets_dimensions_match_type_check check (
          (asset_type = 'manual' and width is null and height is null)
          or
          (asset_type <> 'manual' and width is not null and height is not null)
        );
        create unique index assets_one_manual_per_project_idx
          on assets(project_id) where asset_type = 'manual' and deleted_at is null;
      `);
      await client.query('insert into schema_migrations(version) values (4)');
    }
    const versionFive = await client.query<{ version: number }>(
      'select version from schema_migrations where version = 5',
    );
    if (versionFive.rowCount === 0) {
      await client.query(`
        alter table assets drop constraint if exists assets_image_role_check;
        alter table assets add constraint assets_image_role_check check (
          image_role is null or image_role in (
            'main', 'feature', 'lifestyle', 'detail',
            'feature_1', 'feature_2', 'feature_3', 'feature_4',
            'lifestyle_1', 'lifestyle_2', 'lifestyle_3'
          )
        );
        alter table generation_jobs drop constraint if exists generation_jobs_image_role_check;
        alter table generation_jobs add constraint generation_jobs_image_role_check check (
          image_role is null or image_role in (
            'main', 'feature', 'lifestyle', 'detail',
            'feature_1', 'feature_2', 'feature_3', 'feature_4',
            'lifestyle_1', 'lifestyle_2', 'lifestyle_3'
          )
        );
      `);
      await client.query('insert into schema_migrations(version) values (5)');
    }
    const versionSix = await client.query(
      'select version from schema_migrations where version = 6',
    );
    if (versionSix.rowCount === 0) {
      await client.query(`
        alter table users alter column credit_balance set default 500;
        with topped_up as (
          update users set credit_balance = credit_balance + 450, updated_at = now()
          returning id, credit_balance
        )
        insert into credit_ledger(id, user_id, entry_type, delta, balance_after, idempotency_key, description)
        select gen_random_uuid(), id, 'grant', 450, credit_balance,
               'm6-testing-grant:' || id::text, '测试额度升级补赠（50 → 500，保留已消费额度）'
        from topped_up;
      `);
      await client.query('insert into schema_migrations(version) values (6)');
    }
    const versionSeven = await client.query(
      'select version from schema_migrations where version = 7',
    );
    if (versionSeven.rowCount === 0) {
      await client.query(`
        alter table assets drop constraint if exists assets_image_role_check;
        alter table assets add constraint assets_image_role_check check (image_role is null or image_role in ('main','feature','lifestyle','detail','feature_1','feature_2','feature_3','feature_4','lifestyle_1','lifestyle_2','lifestyle_3') or image_role ~ '^(gallery_[1-5]|pdp_[1-9])$');
        alter table generation_jobs drop constraint if exists generation_jobs_image_role_check;
        alter table generation_jobs add constraint generation_jobs_image_role_check check (image_role is null or image_role in ('main','feature','lifestyle','detail','feature_1','feature_2','feature_3','feature_4','lifestyle_1','lifestyle_2','lifestyle_3') or image_role ~ '^(gallery_[1-5]|pdp_[1-9])$');
      `);
      await client.query('insert into schema_migrations(version) values (7)');
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
