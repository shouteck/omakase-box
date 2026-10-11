ALTER TABLE private_feedback_outbox ADD COLUMN submission_id uuid;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private_outbox_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.event_id IS DISTINCT FROM OLD.event_id OR NEW.submission_id IS DISTINCT FROM OLD.submission_id OR NEW.payload IS DISTINCT FROM OLD.payload OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'outbox_event_immutable'; END IF;
  IF OLD.delivered_at IS NOT NULL AND NEW.delivered_at IS DISTINCT FROM OLD.delivered_at THEN RAISE EXCEPTION 'outbox_delivery_immutable'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION private_outbox_submission_required() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.submission_id IS NULL THEN RAISE EXCEPTION 'outbox_submission_required'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER private_outbox_submission_guard BEFORE INSERT ON private_feedback_outbox FOR EACH ROW EXECUTE FUNCTION private_outbox_submission_required();
