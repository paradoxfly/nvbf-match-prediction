-- League jackpot predictions are submitted once and can never be changed, by players or staff.
ALTER TABLE "jackpot_entries" RENAME COLUMN "changed_at" TO "submitted_at";
--> statement-breakpoint
-- Each entry is now its own permanent record, so the revision history is redundant.
DROP TABLE "jackpot_entry_revisions";
--> statement-breakpoint
CREATE TRIGGER jackpot_entries_append_only BEFORE UPDATE OR DELETE ON jackpot_entries
  FOR EACH ROW EXECUTE FUNCTION predict_append_only();
