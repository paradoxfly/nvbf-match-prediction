-- History that must never be rewritten: block UPDATE and DELETE (TRUNCATE is left for tests).
CREATE OR REPLACE FUNCTION predict_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION predict_append_only();
--> statement-breakpoint
CREATE TRIGGER ledger_entries_append_only BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION predict_append_only();
--> statement-breakpoint
CREATE TRIGGER prediction_revisions_append_only BEFORE UPDATE OR DELETE ON prediction_revisions
  FOR EACH ROW EXECUTE FUNCTION predict_append_only();
--> statement-breakpoint
CREATE TRIGGER jackpot_entry_revisions_append_only BEFORE UPDATE OR DELETE ON jackpot_entry_revisions
  FOR EACH ROW EXECUTE FUNCTION predict_append_only();
--> statement-breakpoint
-- Once a day has opened, the settings that decide money and ranking are frozen (PRD §5.8).
CREATE OR REPLACE FUNCTION predict_frozen_day_config() RETURNS trigger AS $$
BEGIN
  IF OLD.opened_at IS NOT NULL AND (
    NEW.entry_fee_kobo IS DISTINCT FROM OLD.entry_fee_kobo OR
    NEW.prize_bps IS DISTINCT FROM OLD.prize_bps OR
    NEW.jackpot_bps IS DISTINCT FROM OLD.jackpot_bps OR
    NEW.prize_tiers_bps IS DISTINCT FROM OLD.prize_tiers_bps OR
    NEW.scoring IS DISTINCT FROM OLD.scoring OR
    NEW.format IS DISTINCT FROM OLD.format OR
    NEW.tie_breakers IS DISTINCT FROM OLD.tie_breakers OR
    NEW.lock_lead_min IS DISTINCT FROM OLD.lock_lead_min OR
    NEW.min_scored_matches IS DISTINCT FROM OLD.min_scored_matches OR
    NEW.config_hash IS DISTINCT FROM OLD.config_hash OR
    NEW.rules_hash IS DISTINCT FROM OLD.rules_hash OR
    NEW.rules_snapshot IS DISTINCT FROM OLD.rules_snapshot OR
    NEW.collection_account IS DISTINCT FROM OLD.collection_account OR
    NEW.opened_at IS DISTINCT FROM OLD.opened_at
  ) THEN
    RAISE EXCEPTION 'match day % settings are frozen since it opened', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER match_days_frozen_config BEFORE UPDATE ON match_days
  FOR EACH ROW EXECUTE FUNCTION predict_frozen_day_config();
