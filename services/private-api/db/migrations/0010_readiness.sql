CREATE TABLE private_readiness_records (
  id uuid PRIMARY KEY,
  task_id uuid NOT NULL,
  task_version integer NOT NULL CHECK (task_version > 0),
  package_digest char(64) NOT NULL CHECK (package_digest ~ '^[a-f0-9]{64}$'),
  kind text NOT NULL CHECK (kind IN ('fresh_build','traceability','ambiguity_review','external_solve','human_review','preservation_check','integration_check','reference_patch')),
  status text NOT NULL CHECK (status IN ('passed','failed','unverified')),
  reason_code text CHECK (reason_code ~ '^[a-z0-9_.-]{1,64}$'),
  classified_outcome text CHECK (classified_outcome IN ('infrastructure','specification','implementation','other')),
  details_digest char(64) CHECK (details_digest ~ '^[a-f0-9]{64}$'),
  assurance text NOT NULL CHECK (assurance IN ('tested','unverified')),
  recorded_by uuid NOT NULL REFERENCES private_accounts(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'passed' AND reason_code IS NULL) OR (status <> 'passed' AND reason_code IS NOT NULL)),
  CHECK (kind <> 'external_solve' OR status <> 'failed' OR classified_outcome IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE private_readiness_decisions (
  id uuid PRIMARY KEY,
  task_id uuid NOT NULL,
  task_version integer NOT NULL CHECK (task_version > 0),
  package_digest char(64) NOT NULL CHECK (package_digest ~ '^[a-f0-9]{64}$'),
  decision text NOT NULL CHECK (decision IN ('publishable','blocked')),
  reasons jsonb NOT NULL CHECK (octet_length(reasons::text) <= 65536),
  evaluated_record_ids jsonb NOT NULL CHECK (octet_length(evaluated_record_ids::text) <= 65536),
  decided_by uuid NOT NULL REFERENCES private_accounts(id),
  decided_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE FUNCTION guard_readiness_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind = 'human_review' AND NOT EXISTS (SELECT 1 FROM private_accounts WHERE id = NEW.recorded_by AND role = 'owner' AND NOT disabled) THEN RAISE EXCEPTION 'owner_review_required'; END IF;
  IF NEW.kind = 'external_solve' AND NEW.status = 'failed' AND NEW.classified_outcome IS NULL THEN RAISE EXCEPTION 'solve_unclassified'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER readiness_record_guard BEFORE INSERT ON private_readiness_records FOR EACH ROW EXECUTE FUNCTION guard_readiness_record();
--> statement-breakpoint
CREATE FUNCTION reject_readiness_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'immutable_readiness_record';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER immutable_readiness_records BEFORE UPDATE OR DELETE ON private_readiness_records FOR EACH ROW EXECUTE FUNCTION reject_readiness_mutation();
--> statement-breakpoint
CREATE TRIGGER immutable_readiness_decisions BEFORE UPDATE OR DELETE ON private_readiness_decisions FOR EACH ROW EXECUTE FUNCTION reject_readiness_mutation();
