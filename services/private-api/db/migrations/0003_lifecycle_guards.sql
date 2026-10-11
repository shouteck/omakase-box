CREATE FUNCTION private_evaluation_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'received' OR NEW.version <> 1 OR NEW.superseded THEN RAISE EXCEPTION 'invalid_initial_evaluation'; END IF;
    RETURN NEW;
  END IF;
  IF ROW(NEW.id,NEW.permit_id,NEW.task_id,NEW.task_version,NEW.submission_id,NEW.submission_hash,NEW.package_hash,NEW.private_base_revision) IS DISTINCT FROM ROW(OLD.id,OLD.permit_id,OLD.task_id,OLD.task_version,OLD.submission_id,OLD.submission_hash,OLD.package_hash,OLD.private_base_revision) THEN RAISE EXCEPTION 'evaluation_binding_immutable'; END IF;
  IF NEW.version <> OLD.version + 1 THEN RAISE EXCEPTION 'stale_evaluation_version'; END IF;
  IF OLD.superseded AND NOT NEW.superseded THEN RAISE EXCEPTION 'supersession_irreversible'; END IF;
  IF NEW.state IS DISTINCT FROM OLD.state AND NOT (CASE OLD.state
    WHEN 'received' THEN NEW.state IN ('public_evaluating','infrastructure_failure')
    WHEN 'public_evaluating' THEN NEW.state IN ('private_evaluating','changes_required','package_defect','infrastructure_failure')
    WHEN 'private_evaluating' THEN NEW.state IN ('owner_review','changes_required','package_defect','infrastructure_failure')
    WHEN 'owner_review' THEN NEW.state IN ('accepted','changes_required','package_defect','infrastructure_failure')
    ELSE false END) THEN RAISE EXCEPTION 'invalid_evaluation_transition'; END IF;
  IF OLD.result IS NOT NULL AND NEW.result IS DISTINCT FROM OLD.result THEN RAISE EXCEPTION 'evaluation_result_immutable'; END IF;
  IF NEW.state IN ('owner_review','accepted') AND (NEW.result IS NULL OR NEW.result->>'outcome' IS DISTINCT FROM 'passed') THEN RAISE EXCEPTION 'completed_evaluation_required'; END IF;
  IF NEW.state = 'accepted' AND (NEW.superseded OR NOT EXISTS (SELECT 1 FROM private_acceptances WHERE evaluation_id = NEW.id)) THEN RAISE EXCEPTION 'owner_acceptance_required'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER private_evaluation_integrity_guard BEFORE INSERT OR UPDATE ON private_evaluations FOR EACH ROW EXECUTE FUNCTION private_evaluation_integrity();

CREATE FUNCTION private_obligation_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'due' OR NEW.settlement_reference IS NOT NULL THEN RAISE EXCEPTION 'invalid_initial_obligation'; END IF;
  ELSE
    IF ROW(NEW.event_id,NEW.acceptance_id,NEW.payee_id,NEW.reason,NEW.currency,NEW.amount_minor,NEW.created_at) IS DISTINCT FROM ROW(OLD.event_id,OLD.acceptance_id,OLD.payee_id,OLD.reason,OLD.currency,OLD.amount_minor,OLD.created_at) THEN RAISE EXCEPTION 'obligation_terms_immutable'; END IF;
    IF OLD.state = 'settlement_recorded' AND (NEW.state IS DISTINCT FROM OLD.state OR NEW.settlement_reference IS DISTINCT FROM OLD.settlement_reference) THEN RAISE EXCEPTION 'settlement_immutable'; END IF;
  END IF;
  IF NEW.state = 'settlement_recorded' AND (NEW.settlement_reference IS NULL OR btrim(NEW.settlement_reference) = '') THEN RAISE EXCEPTION 'settlement_reference_required'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER private_obligation_integrity_guard BEFORE INSERT OR UPDATE ON private_payment_obligations FOR EACH ROW EXECUTE FUNCTION private_obligation_integrity();

CREATE FUNCTION private_outbox_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.event_id IS DISTINCT FROM OLD.event_id OR NEW.payload IS DISTINCT FROM OLD.payload OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'outbox_event_immutable'; END IF;
  IF OLD.delivered_at IS NOT NULL AND NEW.delivered_at IS DISTINCT FROM OLD.delivered_at THEN RAISE EXCEPTION 'outbox_delivery_immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER private_outbox_integrity_guard BEFORE UPDATE ON private_feedback_outbox FOR EACH ROW EXECUTE FUNCTION private_outbox_integrity();

ALTER TABLE private_payment_obligations ADD CONSTRAINT private_payable_event_acceptance_unique UNIQUE (event_id,acceptance_id);
ALTER TABLE private_acceptances ADD CONSTRAINT private_acceptance_payable_exact FOREIGN KEY (event_id,id) REFERENCES private_payment_obligations(event_id,acceptance_id) DEFERRABLE INITIALLY DEFERRED;
