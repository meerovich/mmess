import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  pgEnum,
  boolean,
  integer,
  unique,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ─── Enums ───────────────────────────────────────────────────────────────────

export const conversationTypeEnum = pgEnum('conversation_type', ['direct', 'group']);

// ─── Timestamp helper ────────────────────────────────────────────────────────

const timestamps = () => ({
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Tables ──────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  username: varchar('username', { length: 50 }).notNull().unique(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password_hash: text('password_hash').notNull(),
  avatar_url: text('avatar_url'),
  last_seen_at: timestamp('last_seen_at', { withTimezone: true }), // null = never seen (Plan 04-02 updates on WS disconnect)
  ...timestamps(),
});

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  type: conversationTypeEnum('type').notNull(),
  name: varchar('name', { length: 100 }),
  avatar_url: text('avatar_url'),
  last_message_id: uuid('last_message_id'), // denormalized for list view (ARCHITECTURE.md Pattern 4)
  ...timestamps(),
});

export const conversation_participants = pgTable(
  'conversation_participants',
  {
    conversation_id: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    is_admin: boolean('is_admin').notNull().default(false),
    can_edit_messages: boolean('can_edit_messages').notNull().default(false),
    last_read_message_id: uuid('last_read_message_id'), // for unread count (PITFALLS.md #8)
    joined_at: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: unique().on(t.conversation_id, t.user_id),
    idx_conversation: index('idx_cp_conversation').on(t.conversation_id),
    idx_user: index('idx_cp_user').on(t.user_id),
  })
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    conversation_id: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    sender_id: uuid('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: text('content'),
    file_id: uuid('file_id'), // references files.id — set after files table
    reply_to_id: uuid('reply_to_id'), // self-reference for quoted replies
    is_deleted: boolean('is_deleted').notNull().default(false),
    edited_at: timestamp('edited_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => ({
    // Index for cursor-based pagination (ARCHITECTURE.md Pattern 3)
    idx_conv_created: index('idx_messages_conv_created').on(t.conversation_id, t.created_at),
  })
);

export const message_reactions = pgTable(
  'message_reactions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    message_id: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    emoji: varchar('emoji', { length: 10 }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    unique_reaction: unique().on(t.message_id, t.user_id, t.emoji),
  })
);

export const message_reads = pgTable(
  'message_reads',
  {
    message_id: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    read_at: timestamp('read_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: unique().on(t.message_id, t.user_id), // composite PK — one row per user per message
    idx_message: index('idx_mr_message').on(t.message_id),
    idx_user: index('idx_mr_user').on(t.user_id),
  })
);

export const files = pgTable('files', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  uploader_id: uuid('uploader_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  original_name: varchar('original_name', { length: 255 }).notNull(),
  storage_name: varchar('storage_name', { length: 255 }).notNull().unique(), // UUID-based, never user-supplied (PITFALLS.md #4)
  mimetype: varchar('mimetype', { length: 127 }).notNull(),
  size_bytes: integer('size_bytes').notNull(),
  ...timestamps(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token_hash: text('token_hash').notNull().unique(),
    device_label: varchar('device_label', { length: 100 }),
    user_agent: text('user_agent'),
    ip_address: varchar('ip_address', { length: 45 }), // IPv6 max 45 chars
    last_seen_at: timestamp('last_seen_at', { withTimezone: true }),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps(),
  },
  (t) => ({
    idx_user_sessions: index('idx_sessions_user').on(t.user_id),
  })
);

export const invites = pgTable('invites', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  token_hash: text('token_hash').notNull().unique(),
  created_by: uuid('created_by').notNull().references(() => users.id),
  used_by: uuid('used_by').references(() => users.id),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  used_at: timestamp('used_at', { withTimezone: true }),
  ...timestamps(),
});
