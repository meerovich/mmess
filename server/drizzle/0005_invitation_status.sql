DO $$ BEGIN
  CREATE TYPE "public"."participant_status" AS ENUM('accepted', 'pending', 'declined');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD COLUMN "status" "participant_status" NOT NULL DEFAULT 'accepted';