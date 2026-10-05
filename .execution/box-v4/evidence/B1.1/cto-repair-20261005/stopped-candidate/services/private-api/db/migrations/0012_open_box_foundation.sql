CREATE TABLE box_behavior_artifacts (
  artifact_id uuid PRIMARY KEY,
  payload jsonb NOT NULL,
  content_hash char(64) NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  intent_id uuid,
  created_by uuid NOT NULL REFERENCES private_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (payload->>'profile' = 'open_trusted'),
  CHECK (payload->>'artifactId' = artifact_id::text)
);
--> statement-breakpoint
CREATE TABLE box_versions (
  box_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  state text NOT NULL CHECK (state IN ('draft','open','closed','cancelled')),
  payload jsonb NOT NULL,
  content_hash char(64) NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  author_id uuid NOT NULL REFERENCES private_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (box_id, version),
  CHECK (payload->>'profile' = 'open_trusted'),
  CHECK (payload->>'boxId' = box_id::text),
  CHECK (payload->>'version' = version::text)
);
--> statement-breakpoint
CREATE TABLE box_heads (
  box_id uuid PRIMARY KEY,
  current_version integer NOT NULL CHECK (current_version > 0),
  FOREIGN KEY (box_id, current_version) REFERENCES box_versions(box_id, version)
);
--> statement-breakpoint
CREATE TABLE box_behavior_approvals (
  approval_id uuid PRIMARY KEY,
  box_id uuid NOT NULL,
  version integer NOT NULL,
  artifact_hash char(64) NOT NULL CHECK (artifact_hash ~ '^[a-f0-9]{64}$'),
  approved_by uuid NOT NULL REFERENCES private_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (box_id, version),
  FOREIGN KEY (box_id, version) REFERENCES box_versions(box_id, version)
);
--> statement-breakpoint
CREATE TABLE box_assignments (
  assignment_id uuid PRIMARY KEY,
  box_id uuid NOT NULL,
  box_version integer NOT NULL,
  box_version_hash char(64) NOT NULL CHECK (box_version_hash ~ '^[a-f0-9]{64}$'),
  executor_kind text NOT NULL CHECK (executor_kind IN ('human','agent','hybrid')),
  executor_id varchar(128) NOT NULL,
  capability text NOT NULL CHECK (capability IN ('attempt.execute','attempt.evaluate')),
  assigned_by uuid NOT NULL REFERENCES private_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (box_id, box_version, executor_id, capability),
  FOREIGN KEY (box_id, box_version) REFERENCES box_versions(box_id, version)
);
--> statement-breakpoint
CREATE TABLE box_scoped_tokens (
  token_hash char(64) PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  box_id uuid NOT NULL,
  attempt_id uuid,
  capability text NOT NULL CHECK (capability IN ('attempt.execute','attempt.evaluate')),
  actor_label varchar(128) NOT NULL,
  expires_at timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES private_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE box_attempts (
  attempt_id uuid PRIMARY KEY,
  box_id uuid NOT NULL,
  box_version integer NOT NULL,
  box_version_hash char(64) NOT NULL CHECK (box_version_hash ~ '^[a-f0-9]{64}$'),
  executor_kind text NOT NULL CHECK (executor_kind IN ('human','agent','hybrid')),
  executor_id varchar(128) NOT NULL,
  base_commit char(40) NOT NULL CHECK (base_commit ~ '^[a-f0-9]{40}$'),
  worktree_ref varchar(256),
  patch_hash char(64) CHECK (patch_hash ~ '^[a-f0-9]{64}$'),
  environment_digest varchar(71) NOT NULL CHECK (environment_digest ~ '^sha256:[a-f0-9]{64}$'),
  evaluator_digest char(64) NOT NULL CHECK (evaluator_digest ~ '^[a-f0-9]{64}$'),
  state text NOT NULL CHECK (state IN ('open','submitted','cancelled','closed')),
  version integer NOT NULL CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (box_id, box_version) REFERENCES box_versions(box_id, version)
);
--> statement-breakpoint
CREATE TABLE box_evaluation_receipts (
  receipt_id uuid PRIMARY KEY,
  attempt_id uuid NOT NULL REFERENCES box_attempts(attempt_id),
  box_version_hash char(64) NOT NULL CHECK (box_version_hash ~ '^[a-f0-9]{64}$'),
  environment_digest varchar(71) NOT NULL CHECK (environment_digest ~ '^sha256:[a-f0-9]{64}$'),
  evaluator_digest char(64) NOT NULL CHECK (evaluator_digest ~ '^[a-f0-9]{64}$'),
  outcome text NOT NULL CHECK (outcome IN ('passed','failed','unavailable','cancelled','timed_out','infrastructure_failure')),
  payload jsonb NOT NULL,
  recorded_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (payload->>'receiptId' = receipt_id::text),
  CHECK (payload->>'attemptId' = attempt_id::text)
);
--> statement-breakpoint
CREATE TABLE box_review_decisions (
  review_id uuid PRIMARY KEY,
  attempt_id uuid NOT NULL REFERENCES box_attempts(attempt_id),
  box_id uuid NOT NULL,
  box_version_hash char(64) NOT NULL CHECK (box_version_hash ~ '^[a-f0-9]{64}$'),
  candidate_hash char(64) NOT NULL CHECK (candidate_hash ~ '^[a-f0-9]{64}$'),
  verdict text NOT NULL CHECK (verdict IN ('approved','changes_required','box_defect','infrastructure_failure')),
  reviewer_id uuid NOT NULL REFERENCES private_accounts(id),
  rationale text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, reviewer_id)
);
--> statement-breakpoint
CREATE TABLE box_merge_approvals (
  approval_id uuid PRIMARY KEY,
  box_id uuid NOT NULL,
  attempt_id uuid NOT NULL REFERENCES box_attempts(attempt_id),
  review_id uuid NOT NULL REFERENCES box_review_decisions(review_id),
  target_ref varchar(64) NOT NULL,
  base_commit char(40) NOT NULL CHECK (base_commit ~ '^[a-f0-9]{40}$'),
  candidate_hash char(64) NOT NULL CHECK (candidate_hash ~ '^[a-f0-9]{64}$'),
  approved_by uuid NOT NULL REFERENCES private_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, approved_by)
);
--> statement-breakpoint
CREATE TABLE box_merge_records (
  merge_id uuid PRIMARY KEY,
  approval_id uuid NOT NULL UNIQUE REFERENCES box_merge_approvals(approval_id),
  box_id uuid NOT NULL,
  attempt_id uuid NOT NULL REFERENCES box_attempts(attempt_id),
  source_candidate_hash char(64) NOT NULL CHECK (source_candidate_hash ~ '^[a-f0-9]{64}$'),
  target_ref varchar(64) NOT NULL,
  result_commit char(40) CHECK (result_commit ~ '^[a-f0-9]{40}$'),
  state text NOT NULL CHECK (state IN ('applied','rejected')),
  applied_by uuid NOT NULL REFERENCES private_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE box_operation_keys (
  actor_id varchar(128) NOT NULL,
  operation varchar(32) NOT NULL,
  key varchar(128) NOT NULL,
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  result_hash char(64) NOT NULL CHECK (result_hash ~ '^[a-f0-9]{64}$'),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, operation, key)
);
--> statement-breakpoint
CREATE FUNCTION reject_box_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'box_record_immutable' USING ERRCODE='23514';
END;
$$;
--> statement-breakpoint
CREATE FUNCTION box_version_content_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.box_id IS DISTINCT FROM OLD.box_id OR NEW.version IS DISTINCT FROM OLD.version OR NEW.payload IS DISTINCT FROM OLD.payload OR NEW.content_hash IS DISTINCT FROM OLD.content_hash OR NEW.author_id IS DISTINCT FROM OLD.author_id THEN RAISE EXCEPTION 'box_version_content_immutable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION box_attempt_content_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.attempt_id IS DISTINCT FROM OLD.attempt_id OR NEW.box_id IS DISTINCT FROM OLD.box_id OR NEW.box_version IS DISTINCT FROM OLD.box_version OR NEW.box_version_hash IS DISTINCT FROM OLD.box_version_hash OR NEW.executor_id IS DISTINCT FROM OLD.executor_id OR NEW.base_commit IS DISTINCT FROM OLD.base_commit THEN RAISE EXCEPTION 'box_attempt_content_immutable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER box_behavior_artifacts_immutable BEFORE UPDATE ON box_behavior_artifacts FOR EACH ROW EXECUTE FUNCTION reject_box_update();
--> statement-breakpoint
CREATE TRIGGER box_behavior_approvals_immutable BEFORE UPDATE ON box_behavior_approvals FOR EACH ROW EXECUTE FUNCTION reject_box_update();
--> statement-breakpoint
CREATE TRIGGER box_assignments_immutable BEFORE UPDATE ON box_assignments FOR EACH ROW EXECUTE FUNCTION reject_box_update();
--> statement-breakpoint
CREATE TRIGGER box_scoped_tokens_immutable BEFORE UPDATE ON box_scoped_tokens FOR EACH ROW EXECUTE FUNCTION reject_box_update();
--> statement-breakpoint
CREATE TRIGGER box_evaluation_receipts_immutable BEFORE UPDATE ON box_evaluation_receipts FOR EACH ROW EXECUTE FUNCTION reject_box_update();
--> statement-breakpoint
CREATE TRIGGER box_review_decisions_immutable BEFORE UPDATE ON box_review_decisions FOR EACH ROW EXECUTE FUNCTION reject_box_update();
--> statement-breakpoint
CREATE TRIGGER box_merge_approvals_immutable BEFORE UPDATE ON box_merge_approvals FOR EACH ROW EXECUTE FUNCTION reject_box_update();
--> statement-breakpoint
CREATE TRIGGER box_merge_records_immutable BEFORE UPDATE ON box_merge_records FOR EACH ROW EXECUTE FUNCTION reject_box_update();
--> statement-breakpoint
CREATE TRIGGER box_operation_keys_immutable BEFORE UPDATE ON box_operation_keys FOR EACH ROW EXECUTE FUNCTION reject_box_update();
--> statement-breakpoint
CREATE TRIGGER box_versions_content BEFORE UPDATE ON box_versions FOR EACH ROW EXECUTE FUNCTION box_version_content_immutable();
--> statement-breakpoint
CREATE TRIGGER box_attempts_content BEFORE UPDATE ON box_attempts FOR EACH ROW EXECUTE FUNCTION box_attempt_content_immutable();
