-- Players can change their jackpot tables until entries close (owner, 20 Oct 2026). Each save
-- is kept in jackpot_entry_revisions.
CREATE TABLE "jackpot_entry_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"jackpot_entry_id" uuid NOT NULL,
	"orders" jsonb NOT NULL,
	"saved_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jackpot_entry_revisions" ADD CONSTRAINT "jackpot_entry_revisions_jackpot_entry_id_jackpot_entries_id_fk" FOREIGN KEY ("jackpot_entry_id") REFERENCES "public"."jackpot_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jackpot_entry_revisions_jackpot_entry_id_saved_at_index" ON "jackpot_entry_revisions" USING btree ("jackpot_entry_id","saved_at");--> statement-breakpoint
CREATE TRIGGER jackpot_entry_revisions_append_only BEFORE UPDATE OR DELETE ON jackpot_entry_revisions
  FOR EACH ROW EXECUTE FUNCTION predict_append_only();
--> statement-breakpoint
-- Every existing entry starts its history with the tables it was submitted with.
INSERT INTO "jackpot_entry_revisions" ("id", "jackpot_entry_id", "orders", "saved_at")
  SELECT gen_random_uuid(), "id", "orders", "submitted_at" FROM "jackpot_entries";
--> statement-breakpoint
DROP TRIGGER jackpot_entries_append_only ON jackpot_entries;
--> statement-breakpoint
-- An entry can change only while its jackpot is open and before entries close, by anyone
-- (staff included). It never moves to another player or jackpot, and is never deleted.
CREATE OR REPLACE FUNCTION predict_jackpot_entry_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'jackpot_entries rows are never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.jackpot_id IS DISTINCT FROM OLD.jackpot_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'a jackpot entry keeps its jackpot and player' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jackpots
    WHERE id = OLD.jackpot_id AND status = 'open' AND entry_closes_at > clock_timestamp()
  ) THEN
    RAISE EXCEPTION 'jackpot entries are closed' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER jackpot_entries_guard BEFORE UPDATE OR DELETE ON jackpot_entries
  FOR EACH ROW EXECUTE FUNCTION predict_jackpot_entry_guard();
