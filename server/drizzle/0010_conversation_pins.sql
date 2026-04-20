ALTER TABLE "conversations"
  ADD COLUMN IF NOT EXISTS "pinned_message_id" uuid REFERENCES "messages"("id") ON DELETE set null;

ALTER TABLE "conversations"
  ADD COLUMN IF NOT EXISTS "pinned_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null;

ALTER TABLE "conversations"
  ADD COLUMN IF NOT EXISTS "pinned_at" timestamp with time zone;
