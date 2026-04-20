CREATE TABLE IF NOT EXISTS "user_key_bundles" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE cascade,
  "public_key_jwk" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "conversation_key_shares" (
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "wrapped_key" text NOT NULL,
  "algorithm" varchar(32) DEFAULT 'RSA-OAEP-256+A256GCM' NOT NULL,
  "key_version" integer DEFAULT 1 NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "conversation_key_shares_conversation_id_user_id_key_version_unique"
    UNIQUE("conversation_id", "user_id", "key_version")
);

CREATE INDEX IF NOT EXISTS "idx_cks_conversation" ON "conversation_key_shares" ("conversation_id");
CREATE INDEX IF NOT EXISTS "idx_cks_user" ON "conversation_key_shares" ("user_id");
