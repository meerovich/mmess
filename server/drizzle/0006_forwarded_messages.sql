ALTER TABLE "messages" ADD COLUMN "forwarded_from_id" uuid;
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_forwarded_from_id_fk" FOREIGN KEY ("forwarded_from_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;