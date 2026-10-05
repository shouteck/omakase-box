CREATE OR REPLACE FUNCTION external_reservation_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'active' OR NEW.version <> 1 THEN RAISE EXCEPTION 'invalid_initial_reservation'; END IF;
  ELSE
    IF ROW(NEW.id,NEW.expires_at,NEW.terms_hash,NEW.package_hash,NEW.contributor_id,NEW.task_id,NEW.task_version) IS DISTINCT FROM ROW(OLD.id,OLD.expires_at,OLD.terms_hash,OLD.package_hash,OLD.contributor_id,OLD.task_id,OLD.task_version) THEN RAISE EXCEPTION 'reservation_terms_immutable'; END IF;
    IF NEW.version <> OLD.version + 1 THEN RAISE EXCEPTION 'stale_reservation_version'; END IF;
    IF NEW.state IS DISTINCT FROM OLD.state AND NOT (CASE OLD.state
      WHEN 'active' THEN NEW.state IN ('in_review','expired','cancelled')
      WHEN 'in_review' THEN NEW.state IN ('active','accepted','expired','cancelled')
      ELSE false END) THEN RAISE EXCEPTION 'invalid_reservation_transition'; END IF;
    IF NEW.evaluated_attempts < OLD.evaluated_attempts THEN RAISE EXCEPTION 'attempt_counter_cannot_reset'; END IF;
  END IF;
  IF NEW.state IN ('active','in_review','accepted') AND NEW.expires_at <= now() THEN RAISE EXCEPTION 'reservation_expired'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION external_submission_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM 1 FROM external_reservations WHERE id = NEW.reservation_id AND contributor_id = NEW.contributor_id AND task_id = NEW.task_id AND task_version = NEW.task_version AND package_hash = NEW.package_hash AND state = 'active' AND expires_at > now() FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'valid_owned_reservation_required'; END IF;
    IF NEW.state <> 'received' OR NEW.version <> 1 OR NEW.superseded THEN RAISE EXCEPTION 'invalid_initial_submission'; END IF;
    IF NEW.permit->>'permitId' IS DISTINCT FROM NEW.permit_id::text OR NEW.permit->>'submissionId' IS DISTINCT FROM NEW.id::text OR NEW.permit->>'reservationId' IS DISTINCT FROM NEW.reservation_id::text OR NEW.permit->>'taskId' IS DISTINCT FROM NEW.task_id::text OR (NEW.permit->>'taskVersion')::integer IS DISTINCT FROM NEW.task_version OR NEW.permit->>'packageDigest' IS DISTINCT FROM NEW.package_hash::text OR NEW.permit->>'submissionHash' IS DISTINCT FROM NEW.submission_hash::text THEN RAISE EXCEPTION 'permit_binding_mismatch'; END IF;
  ELSE
    IF ROW(NEW.id,NEW.reservation_id,NEW.task_id,NEW.task_version,NEW.patch,NEW.package_hash,NEW.submission_hash,NEW.permit,NEW.permit_id,NEW.contributor_id,NEW.idempotency_key) IS DISTINCT FROM ROW(OLD.id,OLD.reservation_id,OLD.task_id,OLD.task_version,OLD.patch,OLD.package_hash,OLD.submission_hash,OLD.permit,OLD.permit_id,OLD.contributor_id,OLD.idempotency_key) THEN RAISE EXCEPTION 'submission_binding_immutable'; END IF;
    IF NEW.version <> OLD.version + 1 THEN RAISE EXCEPTION 'stale_submission_version'; END IF;
    IF OLD.superseded AND NOT NEW.superseded THEN RAISE EXCEPTION 'supersession_irreversible'; END IF;
    IF NEW.state IS DISTINCT FROM OLD.state AND NOT (CASE OLD.state
      WHEN 'received' THEN NEW.state IN ('public_evaluating','infrastructure_failure')
      WHEN 'public_evaluating' THEN NEW.state IN ('private_evaluating','changes_required','package_defect','infrastructure_failure')
      WHEN 'private_evaluating' THEN NEW.state IN ('owner_review','changes_required','package_defect','infrastructure_failure')
      WHEN 'owner_review' THEN NEW.state IN ('accepted','changes_required','package_defect','infrastructure_failure')
      ELSE false END) THEN RAISE EXCEPTION 'invalid_submission_transition'; END IF;
    IF NEW.state = 'accepted' AND NEW.superseded THEN RAISE EXCEPTION 'superseded_attempt'; END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION external_outbox_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM external_submissions WHERE permit_id = NEW.permit_id AND permit = NEW.payload) THEN RAISE EXCEPTION 'outbox_permit_mismatch'; END IF;
  ELSE
    IF NEW.permit_id IS DISTINCT FROM OLD.permit_id OR NEW.payload IS DISTINCT FROM OLD.payload THEN RAISE EXCEPTION 'outbox_event_immutable'; END IF;
    IF OLD.delivered_at IS NOT NULL AND NEW.delivered_at IS DISTINCT FROM OLD.delivered_at THEN RAISE EXCEPTION 'outbox_delivery_immutable'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER external_outbox_integrity_guard BEFORE INSERT OR UPDATE ON external_attempt_outbox FOR EACH ROW EXECUTE FUNCTION external_outbox_integrity();
ALTER TABLE external_submissions ADD CONSTRAINT external_submission_committed_outbox FOREIGN KEY (permit_id) REFERENCES external_attempt_outbox(permit_id) DEFERRABLE INITIALLY DEFERRED;
