CREATE TYPE "public"."email_purpose" AS ENUM('otp', 'winner', 'payout_account_changed', 'payment_confirmed', 'notice');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('queued', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "email_otps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" "citext" NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"to_email" "citext" NOT NULL,
	"user_id" uuid,
	"purpose" "email_purpose" NOT NULL,
	"subject" text NOT NULL,
	"content" jsonb,
	"provider" text NOT NULL,
	"provider_message_id" text,
	"status" "email_status" DEFAULT 'queued' NOT NULL,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"ip_hash" text,
	"send_after" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Accounts made before email sign-in (local test data only) get an undeliverable placeholder.
ALTER TABLE "users" ADD COLUMN "email" "citext";--> statement-breakpoint
UPDATE "users" SET "email" = 'no-email+' || "id" || '@example.invalid' WHERE "email" IS NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "email_on_payment_confirmed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_otps_email_created_at_index" ON "email_otps" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "email_messages_to_email_created_at_index" ON "email_messages" USING btree ("to_email","created_at");--> statement-breakpoint
CREATE INDEX "email_messages_status_send_after_index" ON "email_messages" USING btree ("status","send_after");--> statement-breakpoint
CREATE INDEX "email_messages_created_at_index" ON "email_messages" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE("email");