CREATE FUNCTION external_task_immutability() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.contract IS DISTINCT FROM OLD.contract OR NEW.listing IS DISTINCT FROM OLD.listing OR NEW.envelope IS DISTINCT FROM OLD.envelope OR NEW.package_hash IS DISTINCT FROM OLD.package_hash OR NEW.lineage_id IS DISTINCT FROM OLD.lineage_id OR NEW.id IS DISTINCT FROM OLD.id OR NEW.version IS DISTINCT FROM OLD.version THEN RAISE EXCEPTION 'published_task_immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER external_task_immutability_guard BEFORE UPDATE ON external_task_versions FOR EACH ROW EXECUTE FUNCTION external_task_immutability();

CREATE FUNCTION external_reservation_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.terms_hash IS DISTINCT FROM OLD.terms_hash OR NEW.package_hash IS DISTINCT FROM OLD.package_hash OR NEW.contributor_id IS DISTINCT FROM OLD.contributor_id OR NEW.task_id IS DISTINCT FROM OLD.task_id OR NEW.task_version IS DISTINCT FROM OLD.task_version THEN RAISE EXCEPTION 'reservation_terms_immutable'; END IF;
    IF NEW.version <> OLD.version + 1 THEN RAISE EXCEPTION 'stale_reservation_version'; END IF;
  END IF;
  IF NEW.state IN ('active', 'in_review', 'accepted') AND NEW.expires_at <= now() THEN RAISE EXCEPTION 'reservation_expired'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER external_reservation_integrity_guard BEFORE INSERT OR UPDATE ON external_reservations FOR EACH ROW EXECUTE FUNCTION external_reservation_integrity();

CREATE FUNCTION external_submission_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM external_reservations WHERE id = NEW.reservation_id AND contributor_id = NEW.contributor_id AND task_id = NEW.task_id AND task_version = NEW.task_version AND package_hash = NEW.package_hash AND state = 'active' AND expires_at > now()) THEN RAISE EXCEPTION 'valid_owned_reservation_required'; END IF;
  ELSE
    IF NEW.patch IS DISTINCT FROM OLD.patch OR NEW.package_hash IS DISTINCT FROM OLD.package_hash OR NEW.submission_hash IS DISTINCT FROM OLD.submission_hash OR NEW.permit IS DISTINCT FROM OLD.permit OR NEW.permit_id IS DISTINCT FROM OLD.permit_id OR NEW.contributor_id IS DISTINCT FROM OLD.contributor_id OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key THEN RAISE EXCEPTION 'submission_bytes_immutable'; END IF;
    IF NEW.version <> OLD.version + 1 THEN RAISE EXCEPTION 'stale_submission_version'; END IF;
    IF NEW.state = 'accepted' AND NEW.superseded THEN RAISE EXCEPTION 'superseded_attempt'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER external_submission_integrity_guard BEFORE INSERT OR UPDATE ON external_submissions FOR EACH ROW EXECUTE FUNCTION external_submission_integrity();
