/**
 * DDL for the private evaluation job lifecycle. This exported SQL string is
 * the authoritative content of coordinator migration 0007_evaluation_jobs.
 * The store module applies it through the private pool only in isolated
 * synthetic test databases; the shared migration is applied by the
 * coordinator, never hacked around migrations.
 */
export const EVALUATION_JOB_DDL = `
CREATE TYPE private_job_kind AS ENUM ('public', 'private');
CREATE TYPE private_job_state AS ENUM ('queued', 'running', 'completed', 'cancelled');
CREATE TYPE private_job_evidence_class AS ENUM ('verified', 'unverified', 'infrastructure');
CREATE TYPE private_job_result_outcome AS ENUM ('passed', 'failed', 'unverified', 'infrastructure');

CREATE FUNCTION private_job_check_ids_valid(raw jsonb) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT jsonb_typeof(raw) = 'array'
    AND jsonb_array_length(raw) BETWEEN 1 AND 1024
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(raw) AS entry
      WHERE length(entry) = 0 OR length(entry) > 80 OR entry ~ '[^a-zA-Z0-9_.-]'
    )
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(raw) AS entry GROUP BY entry HAVING count(*) > 1
    )
$$;

CREATE TABLE private_evaluation_jobs (
  id uuid PRIMARY KEY,
  evaluation_id uuid NOT NULL REFERENCES private_evaluations(id),
  evaluation_version integer NOT NULL CHECK (evaluation_version BETWEEN 1 AND 2147483647),
  permit_id uuid NOT NULL,
  attempt_id uuid NOT NULL,
  submission_id uuid NOT NULL,
  task_id uuid NOT NULL,
  task_version integer NOT NULL CHECK (task_version BETWEEN 1 AND 2147483647),
  job_kind private_job_kind NOT NULL,
  profile text NOT NULL CHECK (profile = 'dedicated-linux-kvm-fresh-vm'),
  protocol_version integer NOT NULL DEFAULT 1 CHECK (protocol_version = 1),
  job_state private_job_state NOT NULL DEFAULT 'queued',
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  submission_hash char(64) NOT NULL CHECK (submission_hash ~ '^[a-f0-9]{64}$'),
  package_hash char(64) NOT NULL CHECK (package_hash ~ '^[a-f0-9]{64}$'),
  private_base_revision char(64) NOT NULL CHECK (private_base_revision ~ '^[a-f0-9]{64}$'),
  artifact_hash char(64) NOT NULL CHECK (artifact_hash ~ '^[a-f0-9]{64}$'),
  image_digest text NOT NULL CHECK (image_digest ~ '^sha256:[a-f0-9]{64}$'),
  harness_id text NOT NULL CHECK (harness_id IN ('pure-module/v1', 'frontend/v1', 'backend-api/v1', 'application-policy/v1', 'composed/v1')),
  harness_digest char(64) NOT NULL CHECK (harness_digest ~ '^[a-f0-9]{64}$'),
  required_check_ids jsonb NOT NULL,
  deadline_ms bigint NOT NULL CHECK (deadline_ms BETWEEN 1 AND 9223372036854775807),
  lease_id uuid,
  lease_profile text,
  lease_baseline_digest char(64),
  lease_bound_at timestamptz,
  authoritative_log_digest char(64),
  authoritative_class private_job_evidence_class,
  authoritative_outcome private_job_result_outcome,
  authoritative_cause text CHECK (authoritative_cause IS NULL OR length(authoritative_cause) BETWEEN 1 AND 128),
  authoritative_result_sequence integer CHECK (authoritative_result_sequence BETWEEN 1 AND 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  UNIQUE (evaluation_id, job_kind),
  UNIQUE (permit_id, job_kind)
);

CREATE TABLE private_evaluation_job_results (
  job_id uuid NOT NULL REFERENCES private_evaluation_jobs(id),
  recorded_sequence integer NOT NULL CHECK (recorded_sequence BETWEEN 1 AND 64),
  evidence_class private_job_evidence_class NOT NULL,
  result_outcome private_job_result_outcome NOT NULL,
  cause text NOT NULL CHECK (length(cause) BETWEEN 1 AND 128),
  outcome_checks jsonb NOT NULL CHECK (jsonb_typeof(outcome_checks) = 'array' AND jsonb_array_length(outcome_checks) <= 1024),
  log_digest char(64),
  payload_digest char(64),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, recorded_sequence),
  CHECK (
    (evidence_class = 'verified' AND result_outcome IN ('passed', 'failed') AND payload_digest IS NOT NULL)
    OR (evidence_class = 'unverified' AND result_outcome = 'unverified')
    OR (evidence_class = 'infrastructure' AND result_outcome = 'infrastructure')
  )
);

CREATE TABLE private_evaluation_job_logs (
  job_id uuid PRIMARY KEY REFERENCES private_evaluation_jobs(id),
  bytes bytea NOT NULL CHECK (octet_length(bytes) BETWEEN 0 AND 1048576),
  byte_count integer NOT NULL CHECK (byte_count = octet_length(bytes)),
  original_byte_count integer NOT NULL CHECK (original_byte_count >= byte_count AND original_byte_count BETWEEN 0 AND 9223372036854775807),
  complete boolean NOT NULL,
  log_digest char(64) NOT NULL CHECK (log_digest ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (complete = (original_byte_count = byte_count))
);

CREATE FUNCTION private_evaluation_job_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.job_state <> 'queued' OR NEW.version <> 1 OR NEW.lease_id IS NOT NULL OR NEW.lease_profile IS NOT NULL
      OR NEW.lease_baseline_digest IS NOT NULL OR NEW.lease_bound_at IS NOT NULL OR NEW.authoritative_log_digest IS NOT NULL
      OR NEW.authoritative_class IS NOT NULL OR NEW.authoritative_outcome IS NOT NULL OR NEW.authoritative_cause IS NOT NULL
      OR NEW.authoritative_result_sequence IS NOT NULL OR NEW.ended_at IS NOT NULL
      OR NOT private_job_check_ids_valid(NEW.required_check_ids)
      THEN RAISE EXCEPTION 'invalid_initial_job';
    END IF;
    RETURN NEW;
  END IF;
  IF ROW(NEW.id,NEW.evaluation_id,NEW.evaluation_version,NEW.permit_id,NEW.attempt_id,NEW.submission_id,NEW.task_id,NEW.task_version,NEW.job_kind,NEW.profile,NEW.protocol_version,NEW.submission_hash,NEW.package_hash,NEW.private_base_revision,NEW.artifact_hash,NEW.image_digest,NEW.harness_id,NEW.harness_digest,NEW.required_check_ids,NEW.deadline_ms,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.evaluation_id,OLD.evaluation_version,OLD.permit_id,OLD.attempt_id,OLD.submission_id,OLD.task_id,OLD.task_version,OLD.job_kind,OLD.profile,OLD.protocol_version,OLD.submission_hash,OLD.package_hash,OLD.private_base_revision,OLD.artifact_hash,OLD.image_digest,OLD.harness_id,OLD.harness_digest,OLD.required_check_ids,OLD.deadline_ms,OLD.created_at) THEN RAISE EXCEPTION 'job_binding_immutable'; END IF;
  IF NEW.version <> OLD.version + 1 THEN RAISE EXCEPTION 'stale_job_version'; END IF;
  IF NOT private_job_check_ids_valid(NEW.required_check_ids) THEN RAISE EXCEPTION 'invalid_required_checks'; END IF;
  IF NEW.lease_id IS NULL AND (NEW.lease_profile IS NOT NULL OR NEW.lease_baseline_digest IS NOT NULL OR NEW.lease_bound_at IS NOT NULL) THEN RAISE EXCEPTION 'job_lease_partial'; END IF;
  IF OLD.lease_id IS NOT NULL AND (NEW.lease_id IS DISTINCT FROM OLD.lease_id OR NEW.lease_profile IS DISTINCT FROM OLD.lease_profile OR NEW.lease_baseline_digest IS DISTINCT FROM OLD.lease_baseline_digest OR NEW.lease_bound_at IS DISTINCT FROM OLD.lease_bound_at) THEN RAISE EXCEPTION 'job_lease_immutable'; END IF;
  IF NEW.job_state = 'running' AND NEW.lease_id IS NULL THEN RAISE EXCEPTION 'job_lease_required'; END IF;
  IF OLD.job_state = 'queued' THEN
    IF NEW.job_state NOT IN ('running', 'cancelled', 'completed') THEN RAISE EXCEPTION 'invalid_job_transition'; END IF;
    IF NEW.job_state = 'completed' AND (NEW.authoritative_class IS DISTINCT FROM 'infrastructure' OR NEW.authoritative_cause NOT IN ('interrupted', 'runner_unavailable', 'lease_lost')) THEN RAISE EXCEPTION 'invalid_job_transition'; END IF;
  END IF;
  IF OLD.job_state = 'running' AND NEW.job_state NOT IN ('completed', 'cancelled') THEN RAISE EXCEPTION 'invalid_job_transition'; END IF;
  IF OLD.job_state IN ('completed', 'cancelled') AND NEW.job_state IS DISTINCT FROM OLD.job_state THEN RAISE EXCEPTION 'invalid_job_transition'; END IF;
  IF NEW.job_state = 'completed' THEN
    IF NEW.authoritative_class IS NULL OR NEW.authoritative_outcome IS NULL OR NEW.authoritative_cause IS NULL OR NEW.authoritative_result_sequence IS NULL OR NEW.authoritative_log_digest IS NULL OR NEW.ended_at IS NULL THEN RAISE EXCEPTION 'authoritative_result_required'; END IF;
    IF NOT EXISTS (SELECT 1 FROM private_evaluation_job_results AS recorded WHERE recorded.job_id = NEW.id AND recorded.recorded_sequence = NEW.authoritative_result_sequence AND recorded.evidence_class = NEW.authoritative_class AND recorded.result_outcome = NEW.authoritative_outcome AND recorded.cause = NEW.authoritative_cause) THEN RAISE EXCEPTION 'authoritative_result_required'; END IF;
    IF NEW.authoritative_class = 'unverified' AND NEW.authoritative_outcome IS DISTINCT FROM 'unverified' THEN RAISE EXCEPTION 'authoritative_result_required'; END IF;
    IF NEW.authoritative_class = 'infrastructure' AND NEW.authoritative_outcome IS DISTINCT FROM 'infrastructure' THEN RAISE EXCEPTION 'authoritative_result_required'; END IF;
  END IF;
  IF NEW.job_state = 'cancelled' AND NEW.ended_at IS NULL THEN RAISE EXCEPTION 'job_ended_at_required'; END IF;
  IF NEW.job_state <> 'completed' AND (NEW.authoritative_class IS NOT NULL OR NEW.authoritative_outcome IS NOT NULL OR NEW.authoritative_result_sequence IS NOT NULL OR NEW.authoritative_log_digest IS NOT NULL) THEN RAISE EXCEPTION 'authoritative_result_required'; END IF;
  IF OLD.ended_at IS NOT NULL AND (NEW.ended_at IS NULL OR NEW.ended_at IS DISTINCT FROM OLD.ended_at) THEN RAISE EXCEPTION 'invalid_job_transition'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER private_evaluation_job_integrity_guard BEFORE INSERT OR UPDATE ON private_evaluation_jobs FOR EACH ROW EXECUTE FUNCTION private_evaluation_job_integrity();

CREATE FUNCTION private_evaluation_job_result_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'job_result_immutable';
END;
$$;
CREATE TRIGGER private_evaluation_job_results_append_only BEFORE UPDATE OR DELETE ON private_evaluation_job_results FOR EACH ROW EXECUTE FUNCTION private_evaluation_job_result_append_only();

CREATE FUNCTION private_evaluation_job_log_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'job_log_immutable'; END IF;
  IF NOT EXISTS (SELECT 1 FROM private_evaluation_jobs AS parent WHERE parent.id = OLD.job_id AND parent.job_state = 'cancelled') THEN RAISE EXCEPTION 'job_log_delete_requires_cancelled_parent'; END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER private_evaluation_job_logs_immutable BEFORE UPDATE OR DELETE ON private_evaluation_job_logs FOR EACH ROW EXECUTE FUNCTION private_evaluation_job_log_integrity();
`;
