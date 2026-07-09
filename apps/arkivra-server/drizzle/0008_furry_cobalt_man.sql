ALTER TABLE "email_invitations" ADD COLUMN "token_hash" text;--> statement-breakpoint
CREATE INDEX "email_invitations_token_hash_idx" ON "email_invitations" USING btree ("token_hash");