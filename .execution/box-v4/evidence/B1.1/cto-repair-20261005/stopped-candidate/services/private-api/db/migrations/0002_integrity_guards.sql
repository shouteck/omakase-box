ALTER TABLE private_acceptances ADD CONSTRAINT private_acceptance_payable_required FOREIGN KEY (event_id) REFERENCES private_payment_obligations(event_id) DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION private_intent_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.state = 'approved' THEN
    RAISE EXCEPTION 'approved_revision_immutable';
  END IF;
  IF NEW.state = 'approved' THEN
    IF TG_OP <> 'UPDATE' OR OLD.state <> 'ready_for_approval' THEN RAISE EXCEPTION 'invalid_approval_transition'; END IF;
    IF NOT EXISTS (SELECT 1 FROM private_accounts WHERE id = NEW.approved_by AND role = 'owner' AND NOT disabled) THEN RAISE EXCEPTION 'owner_required'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.payload->'decisions') AS decision WHERE (decision->>'required')::boolean AND decision->'answer' = 'null'::jsonb) THEN RAISE EXCEPTION 'unresolved_decisions'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER private_intent_integrity_guard BEFORE INSERT OR UPDATE ON private_intent_revisions FOR EACH ROW EXECUTE FUNCTION private_intent_integrity();

CREATE FUNCTION private_release_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'release_approval_immutable'; END IF;
  IF NOT EXISTS (SELECT 1 FROM private_accounts WHERE id = NEW.owner_id AND role = 'owner' AND NOT disabled) THEN RAISE EXCEPTION 'owner_required'; END IF;
  IF NEW.manifest->>'taskId' IS DISTINCT FROM NEW.task_id::text OR (NEW.manifest->>'version')::integer IS DISTINCT FROM NEW.task_version THEN RAISE EXCEPTION 'release_binding_mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER private_release_integrity_guard BEFORE INSERT OR UPDATE ON private_release_approvals FOR EACH ROW EXECUTE FUNCTION private_release_integrity();

CREATE FUNCTION private_acceptance_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'acceptance_immutable'; END IF;
  IF NOT EXISTS (SELECT 1 FROM private_accounts WHERE id = NEW.owner_id AND role = 'owner' AND NOT disabled) THEN RAISE EXCEPTION 'owner_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM private_evaluations WHERE id = NEW.evaluation_id AND NOT superseded AND state = 'owner_review' AND result->>'outcome' = 'passed') THEN RAISE EXCEPTION 'completed_latest_evaluation_required'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER private_acceptance_integrity_guard BEFORE INSERT OR UPDATE ON private_acceptances FOR EACH ROW EXECUTE FUNCTION private_acceptance_integrity();
