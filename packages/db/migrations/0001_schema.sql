CREATE TYPE "public"."actor_type" AS ENUM('user', 'admin', 'system');--> statement-breakpoint
CREATE TYPE "public"."admin_role" AS ENUM('super_admin', 'finance', 'operations');--> statement-breakpoint
CREATE TYPE "public"."admin_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."category" AS ENUM('men', 'women');--> statement-breakpoint
CREATE TYPE "public"."claim_status" AS ENUM('pending', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."contribution_source" AS ENUM('sponsor', 'operator', 'rollover');--> statement-breakpoint
CREATE TYPE "public"."contribution_status" AS ENUM('pledged', 'allocated', 'returned');--> statement-breakpoint
CREATE TYPE "public"."day_status" AS ENUM('draft', 'published', 'open', 'closed', 'finalized', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."entry_status" AS ENUM('awaiting_payment', 'payment_review', 'confirmed', 'expired', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."jackpot_status" AS ENUM('open', 'closed', 'settled', 'carried_over');--> statement-breakpoint
CREATE TYPE "public"."league_status" AS ENUM('draft', 'active', 'completed');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('scheduled', 'final', 'void');--> statement-breakpoint
CREATE TYPE "public"."media_bucket" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('team_logo', 'sponsor_logo');--> statement-breakpoint
CREATE TYPE "public"."media_status" AS ENUM('pending', 'ready', 'rejected', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."obligation_kind" AS ENUM('prize', 'refund', 'jackpot');--> statement-breakpoint
CREATE TYPE "public"."obligation_status" AS ENUM('awaiting_details', 'ready', 'processing', 'paid', 'details_invalid', 'on_hold');--> statement-breakpoint
CREATE TYPE "public"."payout_attempt_status" AS ENUM('pending', 'paid', 'failed');--> statement-breakpoint
CREATE TYPE "public"."result_status" AS ENUM('provisional', 'confirmed', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."sms_purpose" AS ENUM('otp', 'winner', 'payout_account_changed', 'notice');--> statement-breakpoint
CREATE TYPE "public"."sms_status" AS ENUM('queued', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"reason" text,
	"before" jsonb,
	"after" jsonb,
	"metadata" jsonb,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_days" (
	"id" uuid PRIMARY KEY NOT NULL,
	"league_id" uuid NOT NULL,
	"date" date NOT NULL,
	"title" text,
	"status" "day_status" DEFAULT 'draft' NOT NULL,
	"entry_fee_kobo" bigint NOT NULL,
	"prize_bps" integer NOT NULL,
	"jackpot_bps" integer NOT NULL,
	"prize_tiers_bps" integer[] NOT NULL,
	"scoring" jsonb NOT NULL,
	"format" jsonb NOT NULL,
	"tie_breakers" text[] NOT NULL,
	"lock_lead_min" integer DEFAULT 0 NOT NULL,
	"min_scored_matches" integer,
	"opens_at" timestamp with time zone,
	"submissions_close_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"opened_by_admin_id" uuid,
	"closed_at" timestamp with time zone,
	"closed_by_admin_id" uuid,
	"config_hash" text,
	"rules_snapshot" jsonb,
	"rules_hash" text,
	"collection_account" jsonb,
	"scoring_rev" integer DEFAULT 0 NOT NULL,
	"final_confirmed_count" integer,
	"final_revenue_kobo" bigint,
	"final_participant_share_kobo" bigint,
	"final_jackpot_cut_kobo" bigint,
	"final_contributions_kobo" bigint,
	"final_daily_pool_kobo" bigint,
	"final_operations_kobo" bigint,
	"final_rounding_kobo" bigint,
	"finalized_at" timestamp with time zone,
	"finalized_by_admin_id" uuid,
	"finalize_version" integer DEFAULT 0 NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"cancelled_by_admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_days_leagueId_date_unique" UNIQUE("league_id","date"),
	CONSTRAINT "match_days_fee_positive" CHECK ("match_days"."entry_fee_kobo" > 0),
	CONSTRAINT "match_days_prize_bps" CHECK ("match_days"."prize_bps" between 0 and 10000),
	CONSTRAINT "match_days_jackpot_bps" CHECK ("match_days"."jackpot_bps" between 0 and 10000),
	CONSTRAINT "match_days_lock_lead" CHECK ("match_days"."lock_lead_min" >= 0)
);
--> statement-breakpoint
CREATE TABLE "match_results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"match_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"sets" jsonb NOT NULL,
	"home_sets" integer NOT NULL,
	"away_sets" integer NOT NULL,
	"status" "result_status" DEFAULT 'provisional' NOT NULL,
	"non_standard_reason" text,
	"note" text,
	"entered_by_admin_id" uuid NOT NULL,
	"confirmed_by_admin_id" uuid,
	"confirmed_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_results_matchId_version_unique" UNIQUE("match_id","version")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"match_day_id" uuid NOT NULL,
	"home_team_id" uuid NOT NULL,
	"away_team_id" uuid NOT NULL,
	"category" "category" NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"actual_start_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"status" "match_status" DEFAULT 'scheduled' NOT NULL,
	"void_reason" text,
	"venue" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matches_distinct_teams" CHECK ("matches"."home_team_id" <> "matches"."away_team_id")
);
--> statement-breakpoint
CREATE TABLE "bank_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"bank_reference" text,
	"amount_kobo" bigint NOT NULL,
	"credited_at" timestamp with time zone NOT NULL,
	"sender_name" text,
	"narration" text,
	"note" text,
	"recorded_by_admin_id" uuid NOT NULL,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"voided_by_admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_payments_amount_positive" CHECK ("bank_payments"."amount_kobo" > 0),
	CONSTRAINT "bank_payments_cash_note" CHECK ("bank_payments"."bank_reference" is not null or "bank_payments"."note" is not null)
);
--> statement-breakpoint
CREATE TABLE "entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"match_day_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "entry_status" DEFAULT 'awaiting_payment' NOT NULL,
	"payment_reference" text NOT NULL,
	"fee_kobo" bigint NOT NULL,
	"rules_hash" text NOT NULL,
	"bank_payment_id" uuid,
	"credited_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"confirmed_by_admin_id" uuid,
	"disqualified_at" timestamp with time zone,
	"disqualified_reason" text,
	"disqualified_by_admin_id" uuid,
	"refunded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entries_paymentReference_unique" UNIQUE("payment_reference"),
	CONSTRAINT "entries_matchDayId_userId_unique" UNIQUE("match_day_id","user_id"),
	CONSTRAINT "entries_confirmed_has_payment" CHECK ("entries"."status" <> 'confirmed' or ("entries"."bank_payment_id" is not null and "entries"."credited_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "jackpot_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"jackpot_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"orders" jsonb NOT NULL,
	"changed_at" timestamp with time zone NOT NULL,
	"rules_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jackpot_entries_jackpotId_userId_unique" UNIQUE("jackpot_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "jackpot_entry_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"jackpot_entry_id" uuid NOT NULL,
	"orders" jsonb NOT NULL,
	"saved_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_claims" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entry_id" uuid NOT NULL,
	"sender_name" text NOT NULL,
	"sender_bank" text,
	"amount_kobo" bigint NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"transfer_reference" text,
	"status" "claim_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by_admin_id" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prediction_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entry_id" uuid NOT NULL,
	"match_id" uuid NOT NULL,
	"home_sets" integer NOT NULL,
	"away_sets" integer NOT NULL,
	"sets" jsonb NOT NULL,
	"saved_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "predictions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entry_id" uuid NOT NULL,
	"match_id" uuid NOT NULL,
	"home_sets" integer NOT NULL,
	"away_sets" integer NOT NULL,
	"sets" jsonb NOT NULL,
	"saved_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "predictions_entryId_matchId_unique" UNIQUE("entry_id","match_id")
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" "citext" NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" "admin_role" DEFAULT 'operations' NOT NULL,
	"status" "admin_status" DEFAULT 'active' NOT NULL,
	"totp_secret_enc" text,
	"totp_enabled_at" timestamp with time zone,
	"totp_last_step" integer,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "phone_otps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"admin_user_id" uuid,
	"family_id" uuid NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"replaced_by_id" uuid,
	"user_agent" text,
	"ip_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_refreshTokenHash_unique" UNIQUE("refresh_token_hash"),
	CONSTRAINT "sessions_single_subject" CHECK (("sessions"."user_id" is null) <> ("sessions"."admin_user_id" is null))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"display_name" "citext" NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"status_reason" text,
	"terms_version" text NOT NULL,
	"terms_accepted_at" timestamp with time zone NOT NULL,
	"adult_confirmed_at" timestamp with time zone NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_displayName_unique" UNIQUE("display_name")
);
--> statement-breakpoint
CREATE TABLE "jackpots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"league_id" uuid NOT NULL,
	"status" "jackpot_status" DEFAULT 'open' NOT NULL,
	"entry_closes_at" timestamp with time zone NOT NULL,
	"final_amount_kobo" bigint,
	"winner_jackpot_entry_id" uuid,
	"winner_distance" integer,
	"rules_snapshot" jsonb,
	"settled_at" timestamp with time zone,
	"settled_by_admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jackpots_leagueId_unique" UNIQUE("league_id")
);
--> statement-breakpoint
CREATE TABLE "league_teams" (
	"id" uuid PRIMARY KEY NOT NULL,
	"league_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"category" "category" NOT NULL,
	"played" integer DEFAULT 0 NOT NULL,
	"lost" integer DEFAULT 0 NOT NULL,
	"sets_won" integer DEFAULT 0 NOT NULL,
	"sets_lost" integer DEFAULT 0 NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"position" integer,
	"withdrawn_at" timestamp with time zone,
	"updated_by_admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "league_teams_leagueId_teamId_unique" UNIQUE("league_id","team_id"),
	CONSTRAINT "league_teams_non_negative" CHECK ("league_teams"."played" >= 0 and "league_teams"."lost" >= 0 and "league_teams"."lost" <= "league_teams"."played" and "league_teams"."sets_won" >= 0 and "league_teams"."sets_lost" >= 0 and "league_teams"."points" >= 0)
);
--> statement-breakpoint
CREATE TABLE "leagues" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"status" "league_status" DEFAULT 'draft' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"defaults" jsonb NOT NULL,
	"standings_public" boolean DEFAULT false NOT NULL,
	"standings_points_system" jsonb NOT NULL,
	"standings_updated_at" timestamp with time zone,
	"standings_finalized_at" timestamp with time zone,
	"standings_finalized_by_admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leagues_dates" CHECK ("leagues"."end_date" >= "leagues"."start_date")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" "citext" NOT NULL,
	"short_name" "citext" NOT NULL,
	"category" "category" NOT NULL,
	"logo_media_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_category_name_unique" UNIQUE("category","name"),
	CONSTRAINT "teams_category_shortName_unique" UNIQUE("category","short_name")
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"uploaded_by_admin_id" uuid,
	"kind" "media_kind" NOT NULL,
	"bucket" "media_bucket" NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"width" integer,
	"height" integer,
	"status" "media_status" DEFAULT 'pending' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_storageKey_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "leaderboard_rows" (
	"id" uuid PRIMARY KEY NOT NULL,
	"match_day_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"points" integer NOT NULL,
	"closeness" integer NOT NULL,
	"exact_count" integer NOT NULL,
	"winner_count" integer NOT NULL,
	"counted_predictions" integer NOT NULL,
	"rank" integer NOT NULL,
	"group_size" integer NOT NULL,
	"prize_kobo" bigint DEFAULT 0 NOT NULL,
	"finalize_version" integer NOT NULL,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_key" text NOT NULL,
	"account" text NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"match_day_id" uuid,
	"jackpot_id" uuid,
	"ref_type" text,
	"ref_id" uuid,
	"memo" text,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_eventKey_account_unique" UNIQUE("event_key","account")
);
--> statement-breakpoint
CREATE TABLE "payout_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"bank_code" text NOT NULL,
	"bank_name" text NOT NULL,
	"account_number_enc" text NOT NULL,
	"enc_key_id" text NOT NULL,
	"last4" text NOT NULL,
	"fingerprint" text NOT NULL,
	"account_name" text NOT NULL,
	"active_from" timestamp with time zone NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"obligation_id" uuid NOT NULL,
	"status" "payout_attempt_status" DEFAULT 'pending' NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"account_snapshot" jsonb,
	"name_enquiry_name" text,
	"transfer_reference" text,
	"failure_reason" text,
	"started_by_admin_id" uuid NOT NULL,
	"completed_by_admin_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payout_obligations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "obligation_kind" NOT NULL,
	"status" "obligation_status" NOT NULL,
	"user_id" uuid,
	"match_day_id" uuid,
	"entry_id" uuid,
	"bank_payment_id" uuid,
	"jackpot_id" uuid,
	"rank" integer,
	"amount_kobo" bigint NOT NULL,
	"reason" text,
	"status_note" text,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payout_obligations_amount_positive" CHECK ("payout_obligations"."amount_kobo" > 0)
);
--> statement-breakpoint
CREATE TABLE "prize_contributions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source" "contribution_source" NOT NULL,
	"status" "contribution_status" DEFAULT 'pledged' NOT NULL,
	"match_day_id" uuid,
	"jackpot_id" uuid,
	"amount_kobo" bigint NOT NULL,
	"sponsor_name" text,
	"sponsor_logo_media_id" uuid,
	"sponsor_url" text,
	"note" text,
	"received_at" timestamp with time zone,
	"allocated_at" timestamp with time zone,
	"returned_at" timestamp with time zone,
	"created_by_admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prize_contributions_one_target" CHECK (("prize_contributions"."match_day_id" is null) <> ("prize_contributions"."jackpot_id" is null)),
	CONSTRAINT "prize_contributions_amount_positive" CHECK ("prize_contributions"."amount_kobo" > 0)
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"collection_account" jsonb,
	"default_day_config" jsonb NOT NULL,
	"sms_on_payment_confirmed" boolean DEFAULT false NOT NULL,
	"support_contact" text,
	"updated_by_admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_single_row" CHECK ("settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "sms_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"to_phone" text NOT NULL,
	"user_id" uuid,
	"purpose" "sms_purpose" NOT NULL,
	"body" text,
	"provider" text NOT NULL,
	"provider_message_id" text,
	"status" "sms_status" DEFAULT 'queued' NOT NULL,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"ip_hash" text,
	"send_after" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match_days" ADD CONSTRAINT "match_days_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_days" ADD CONSTRAINT "match_days_opened_by_admin_id_admin_users_id_fk" FOREIGN KEY ("opened_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_days" ADD CONSTRAINT "match_days_closed_by_admin_id_admin_users_id_fk" FOREIGN KEY ("closed_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_days" ADD CONSTRAINT "match_days_finalized_by_admin_id_admin_users_id_fk" FOREIGN KEY ("finalized_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_days" ADD CONSTRAINT "match_days_cancelled_by_admin_id_admin_users_id_fk" FOREIGN KEY ("cancelled_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_entered_by_admin_id_admin_users_id_fk" FOREIGN KEY ("entered_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_confirmed_by_admin_id_admin_users_id_fk" FOREIGN KEY ("confirmed_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_match_day_id_match_days_id_fk" FOREIGN KEY ("match_day_id") REFERENCES "public"."match_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_home_team_id_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_away_team_id_teams_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_payments" ADD CONSTRAINT "bank_payments_recorded_by_admin_id_admin_users_id_fk" FOREIGN KEY ("recorded_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_payments" ADD CONSTRAINT "bank_payments_voided_by_admin_id_admin_users_id_fk" FOREIGN KEY ("voided_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_match_day_id_match_days_id_fk" FOREIGN KEY ("match_day_id") REFERENCES "public"."match_days"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_bank_payment_id_bank_payments_id_fk" FOREIGN KEY ("bank_payment_id") REFERENCES "public"."bank_payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_confirmed_by_admin_id_admin_users_id_fk" FOREIGN KEY ("confirmed_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_disqualified_by_admin_id_admin_users_id_fk" FOREIGN KEY ("disqualified_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jackpot_entries" ADD CONSTRAINT "jackpot_entries_jackpot_id_jackpots_id_fk" FOREIGN KEY ("jackpot_id") REFERENCES "public"."jackpots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jackpot_entries" ADD CONSTRAINT "jackpot_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jackpot_entry_revisions" ADD CONSTRAINT "jackpot_entry_revisions_jackpot_entry_id_jackpot_entries_id_fk" FOREIGN KEY ("jackpot_entry_id") REFERENCES "public"."jackpot_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_claims" ADD CONSTRAINT "payment_claims_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_claims" ADD CONSTRAINT "payment_claims_reviewed_by_admin_id_admin_users_id_fk" FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_revisions" ADD CONSTRAINT "prediction_revisions_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_revisions" ADD CONSTRAINT "prediction_revisions_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jackpots" ADD CONSTRAINT "jackpots_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jackpots" ADD CONSTRAINT "jackpots_settled_by_admin_id_admin_users_id_fk" FOREIGN KEY ("settled_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_teams" ADD CONSTRAINT "league_teams_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_teams" ADD CONSTRAINT "league_teams_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_teams" ADD CONSTRAINT "league_teams_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_standings_finalized_by_admin_id_admin_users_id_fk" FOREIGN KEY ("standings_finalized_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_logo_media_id_media_assets_id_fk" FOREIGN KEY ("logo_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploaded_by_admin_id_admin_users_id_fk" FOREIGN KEY ("uploaded_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_rows" ADD CONSTRAINT "leaderboard_rows_match_day_id_match_days_id_fk" FOREIGN KEY ("match_day_id") REFERENCES "public"."match_days"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_rows" ADD CONSTRAINT "leaderboard_rows_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_rows" ADD CONSTRAINT "leaderboard_rows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_match_day_id_match_days_id_fk" FOREIGN KEY ("match_day_id") REFERENCES "public"."match_days"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_jackpot_id_jackpots_id_fk" FOREIGN KEY ("jackpot_id") REFERENCES "public"."jackpots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_accounts" ADD CONSTRAINT "payout_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_attempts" ADD CONSTRAINT "payout_attempts_obligation_id_payout_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."payout_obligations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_attempts" ADD CONSTRAINT "payout_attempts_started_by_admin_id_admin_users_id_fk" FOREIGN KEY ("started_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_attempts" ADD CONSTRAINT "payout_attempts_completed_by_admin_id_admin_users_id_fk" FOREIGN KEY ("completed_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_obligations" ADD CONSTRAINT "payout_obligations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_obligations" ADD CONSTRAINT "payout_obligations_match_day_id_match_days_id_fk" FOREIGN KEY ("match_day_id") REFERENCES "public"."match_days"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_obligations" ADD CONSTRAINT "payout_obligations_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_obligations" ADD CONSTRAINT "payout_obligations_bank_payment_id_bank_payments_id_fk" FOREIGN KEY ("bank_payment_id") REFERENCES "public"."bank_payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_obligations" ADD CONSTRAINT "payout_obligations_jackpot_id_jackpots_id_fk" FOREIGN KEY ("jackpot_id") REFERENCES "public"."jackpots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prize_contributions" ADD CONSTRAINT "prize_contributions_match_day_id_match_days_id_fk" FOREIGN KEY ("match_day_id") REFERENCES "public"."match_days"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prize_contributions" ADD CONSTRAINT "prize_contributions_jackpot_id_jackpots_id_fk" FOREIGN KEY ("jackpot_id") REFERENCES "public"."jackpots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prize_contributions" ADD CONSTRAINT "prize_contributions_sponsor_logo_media_id_media_assets_id_fk" FOREIGN KEY ("sponsor_logo_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prize_contributions" ADD CONSTRAINT "prize_contributions_created_by_admin_id_admin_users_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_admin_id_admin_users_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_target_type_target_id_index" ON "audit_logs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_index" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_id_index" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "match_days_status_index" ON "match_days" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "match_results_one_confirmed" ON "match_results" USING btree ("match_id") WHERE "match_results"."status" = 'confirmed';--> statement-breakpoint
CREATE INDEX "matches_match_day_id_index" ON "matches" USING btree ("match_day_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_payments_reference_key" ON "bank_payments" USING btree ("bank_reference") WHERE "bank_payments"."bank_reference" is not null;--> statement-breakpoint
CREATE INDEX "bank_payments_credited_at_index" ON "bank_payments" USING btree ("credited_at");--> statement-breakpoint
CREATE INDEX "entries_match_day_id_status_index" ON "entries" USING btree ("match_day_id","status");--> statement-breakpoint
CREATE INDEX "entries_bank_payment_id_index" ON "entries" USING btree ("bank_payment_id");--> statement-breakpoint
CREATE INDEX "entries_user_id_index" ON "entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "jackpot_entry_revisions_jackpot_entry_id_saved_at_index" ON "jackpot_entry_revisions" USING btree ("jackpot_entry_id","saved_at");--> statement-breakpoint
CREATE INDEX "payment_claims_entry_id_index" ON "payment_claims" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "payment_claims_status_created_at_index" ON "payment_claims" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "prediction_revisions_entry_id_match_id_saved_at_index" ON "prediction_revisions" USING btree ("entry_id","match_id","saved_at");--> statement-breakpoint
CREATE INDEX "phone_otps_phone_created_at_index" ON "phone_otps" USING btree ("phone","created_at");--> statement-breakpoint
CREATE INDEX "sessions_user_id_index" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_admin_user_id_index" ON "sessions" USING btree ("admin_user_id");--> statement-breakpoint
CREATE INDEX "sessions_family_id_index" ON "sessions" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "league_teams_league_id_category_index" ON "league_teams" USING btree ("league_id","category");--> statement-breakpoint
CREATE UNIQUE INDEX "leaderboard_rows_current" ON "leaderboard_rows" USING btree ("match_day_id","entry_id") WHERE "leaderboard_rows"."superseded_at" is null;--> statement-breakpoint
CREATE INDEX "leaderboard_rows_match_day_id_rank_index" ON "leaderboard_rows" USING btree ("match_day_id","rank");--> statement-breakpoint
CREATE INDEX "ledger_entries_match_day_id_index" ON "ledger_entries" USING btree ("match_day_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_jackpot_id_index" ON "ledger_entries" USING btree ("jackpot_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_account_index" ON "ledger_entries" USING btree ("account");--> statement-breakpoint
CREATE INDEX "payout_accounts_user_id_active_from_index" ON "payout_accounts" USING btree ("user_id","active_from");--> statement-breakpoint
CREATE INDEX "payout_accounts_fingerprint_index" ON "payout_accounts" USING btree ("fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "payout_attempts_one_live" ON "payout_attempts" USING btree ("obligation_id") WHERE "payout_attempts"."status" in ('pending', 'paid');--> statement-breakpoint
CREATE UNIQUE INDEX "payout_attempts_reference" ON "payout_attempts" USING btree ("transfer_reference") WHERE "payout_attempts"."transfer_reference" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "payout_obligations_entry_kind" ON "payout_obligations" USING btree ("entry_id","kind") WHERE "payout_obligations"."entry_id" is not null and "payout_obligations"."superseded_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "payout_obligations_jackpot" ON "payout_obligations" USING btree ("jackpot_id") WHERE "payout_obligations"."kind" = 'jackpot' and "payout_obligations"."superseded_at" is null;--> statement-breakpoint
CREATE INDEX "payout_obligations_status_index" ON "payout_obligations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payout_obligations_user_id_index" ON "payout_obligations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payout_obligations_match_day_id_index" ON "payout_obligations" USING btree ("match_day_id");--> statement-breakpoint
CREATE INDEX "prize_contributions_match_day_id_index" ON "prize_contributions" USING btree ("match_day_id");--> statement-breakpoint
CREATE INDEX "prize_contributions_jackpot_id_index" ON "prize_contributions" USING btree ("jackpot_id");--> statement-breakpoint
CREATE INDEX "sms_messages_to_phone_created_at_index" ON "sms_messages" USING btree ("to_phone","created_at");--> statement-breakpoint
CREATE INDEX "sms_messages_status_send_after_index" ON "sms_messages" USING btree ("status","send_after");--> statement-breakpoint
CREATE INDEX "sms_messages_created_at_index" ON "sms_messages" USING btree ("created_at");