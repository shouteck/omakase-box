CREATE TABLE box_repository_registrations (
  repo_id varchar(64) PRIMARY KEY CHECK (repo_id ~ '^[A-Za-z][A-Za-z0-9_-]{0,63}$'),
  snapshot_id uuid NOT NULL,
  source_id varchar(64) NOT NULL,
  source_root varchar(4096) NOT NULL,
  base_commit char(40) NOT NULL CHECK (base_commit ~ '^[a-f0-9]{40}$'),
  context_manifest jsonb NOT NULL,
  context_manifest_hash char(64) NOT NULL CHECK (context_manifest_hash ~ '^[a-f0-9]{64}$'),
  environment_ref jsonb NOT NULL,
  evaluator_ref jsonb NOT NULL,
  merge_target jsonb NOT NULL,
  registered_by uuid NOT NULL REFERENCES private_accounts(id),
  registered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_id, base_commit, context_manifest_hash)
);
--> statement-breakpoint
CREATE TRIGGER box_repository_registrations_immutable BEFORE UPDATE ON box_repository_registrations FOR EACH ROW EXECUTE FUNCTION reject_box_update();
