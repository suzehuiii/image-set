import {
  char,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid().primaryKey(),
    email: varchar({ length: 320 }).notNull(),
    passwordHash: varchar('password_hash').notNull(),
    displayName: varchar('display_name', { length: 80 }).notNull(),
    creditBalance: integer('credit_balance').notNull().default(500),
    status: varchar({ length: 20 }).notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex('users_email_idx').on(table.email)],
);

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuid().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: char('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex('auth_sessions_token_idx').on(table.tokenHash)],
);

export const projects = pgTable(
  'projects',
  {
    id: uuid().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar({ length: 120 }).notNull(),
    targetPlatform: varchar('target_platform', { length: 30 }).notNull(),
    targetLocale: varchar('target_locale', { length: 20 }).notNull(),
    productCategory: varchar('product_category', { length: 100 }),
    productBrief: jsonb('product_brief').notNull(),
    analysisResult: jsonb('analysis_result'),
    status: varchar({ length: 30 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [index('projects_user_idx').on(table.userId)],
);

export const assets = pgTable(
  'assets',
  {
    id: uuid().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    assetType: varchar('asset_type', { length: 20 }).notNull(),
    imageRole: varchar('image_role', { length: 20 }),
    objectKey: varchar('object_key').notNull(),
    originalName: varchar('original_name', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 40 }).notNull(),
    width: integer(),
    height: integer(),
    fileSize: integer('file_size').notNull(),
    checksum: char({ length: 64 }).notNull(),
    status: varchar({ length: 20 }).notNull(),
    qaResult: jsonb('qa_result'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('assets_owner_project_idx').on(table.ownerUserId, table.projectId),
  ],
);

export const generationJobs = pgTable(
  'generation_jobs',
  {
    id: uuid().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    jobType: varchar('job_type', { length: 20 }).notNull(),
    imageRole: varchar('image_role', { length: 20 }),
    status: varchar({ length: 20 }).notNull(),
    provider: varchar({ length: 40 }).notNull(),
    model: varchar({ length: 100 }).notNull(),
    promptVersion: varchar('prompt_version', { length: 40 }).notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 120 }).notNull(),
    inputSnapshot: jsonb('input_snapshot').notNull(),
    resultAssetId: uuid('result_asset_id').references(() => assets.id, {
      onDelete: 'set null',
    }),
    creditsReserved: integer('credits_reserved').notNull().default(0),
    attemptCount: integer('attempt_count').notNull().default(0),
    progress: integer().notNull().default(0),
    stage: varchar({ length: 30 }).notNull().default('queued'),
    errorCode: varchar('error_code', { length: 80 }),
    errorMessageSafe: varchar('error_message_safe', { length: 500 }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('generation_jobs_user_idempotency_idx').on(
      table.userId,
      table.idempotencyKey,
    ),
    index('generation_jobs_project_created_idx').on(
      table.projectId,
      table.createdAt,
    ),
  ],
);

export const creditLedger = pgTable(
  'credit_ledger',
  {
    id: uuid().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id').references(() => generationJobs.id, {
      onDelete: 'set null',
    }),
    entryType: varchar('entry_type', { length: 20 }).notNull(),
    delta: integer().notNull(),
    balanceAfter: integer('balance_after').notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 180 }).notNull(),
    description: varchar({ length: 255 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('credit_ledger_idempotency_idx').on(table.idempotencyKey),
    index('credit_ledger_user_created_idx').on(table.userId, table.createdAt),
  ],
);
