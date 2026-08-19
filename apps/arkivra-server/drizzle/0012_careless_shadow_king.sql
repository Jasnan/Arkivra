ALTER TABLE "auth_accounts" ADD COLUMN "issuer" text;--> statement-breakpoint
DO $$
DECLARE
  unsupported_providers text;
BEGIN
  SELECT string_agg(DISTINCT "provider_id", ', ' ORDER BY "provider_id")
  INTO unsupported_providers
  FROM "auth_accounts"
  WHERE "provider_id" NOT IN ('credential', 'google', 'github');

  IF unsupported_providers IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot migrate auth account issuers for unsupported providers: %', unsupported_providers;
  END IF;
END
$$;--> statement-breakpoint
UPDATE "auth_accounts"
SET "issuer" = 'local:credential', "account_id" = "user_id"
WHERE "provider_id" = 'credential';--> statement-breakpoint
UPDATE "auth_accounts"
SET "issuer" = 'https://accounts.google.com'
WHERE "provider_id" = 'google';--> statement-breakpoint
UPDATE "auth_accounts"
SET "issuer" = 'local:oauth:github'
WHERE "provider_id" = 'github';--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "auth_accounts"
    GROUP BY "issuer", "account_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create unique auth account issuer identity because duplicate issuer/account_id pairs exist';
  END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "auth_accounts" ALTER COLUMN "issuer" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_accounts_issuer_account_id_unique" ON "auth_accounts" USING btree ("issuer","account_id");
