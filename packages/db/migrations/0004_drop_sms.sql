DROP TABLE "phone_otps" CASCADE;--> statement-breakpoint
DROP TABLE "sms_messages" CASCADE;--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN "sms_on_payment_confirmed";--> statement-breakpoint
DROP TYPE "public"."sms_purpose";--> statement-breakpoint
DROP TYPE "public"."sms_status";