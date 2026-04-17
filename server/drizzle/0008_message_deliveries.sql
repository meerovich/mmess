CREATE TABLE IF NOT EXISTS "message_deliveries" (
  "message_id" uuid NOT NULL REFERENCES "messages"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "delivered_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "message_deliveries_message_id_user_id_unique" UNIQUE("message_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "idx_md_message" ON "message_deliveries" ("message_id");
CREATE INDEX IF NOT EXISTS "idx_md_user" ON "message_deliveries" ("user_id");
