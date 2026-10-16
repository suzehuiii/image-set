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
    creditBalance: integer('credit_balance').notNull().default(50),
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
    width: integer().notNull(),
    height: integer().notNull(),
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
