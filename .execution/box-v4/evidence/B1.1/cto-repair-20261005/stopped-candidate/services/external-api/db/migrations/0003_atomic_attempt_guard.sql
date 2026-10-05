CREATE FUNCTION external_attempt_reservation_commit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM external_reservations WHERE id = NEW.reservation_id AND state = 'in_review') THEN RAISE EXCEPTION 'attempt_reservation_commit_required'; END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER external_attempt_reservation_commit AFTER INSERT ON external_submissions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION external_attempt_reservation_commit_guard();
