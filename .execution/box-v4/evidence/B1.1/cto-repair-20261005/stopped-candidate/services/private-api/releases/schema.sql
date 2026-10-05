CREATE TABLE private_release_candidates (
  id uuid PRIMARY KEY,
  task_id uuid NOT NULL,
  task_version integer NOT NULL CHECK (task_version > 0),
  intent_id uuid NOT NULL,
  intent_version integer NOT NULL,
  approved_intent_hash char(64) NOT NULL CHECK (approved_intent_hash ~ '^[a-f0-9]{64}$'),
  private_revision char(64) NOT NULL CHECK (private_revision ~ '^[a-f0-9]{64}$'),
  candidate jsonb NOT NULL CHECK (octet_length(candidate::text) <= 16777216),
  manifest_hash char(64) NOT NULL CHECK (manifest_hash ~ '^[a-f0-9]{64}$'),
  staged_by uuid NOT NULL REFERENCES private_accounts(id),
  state text NOT NULL DEFAULT 'release_review' CHECK (state IN ('release_review','approved')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id,task_version),
  FOREIGN KEY (intent_id,intent_version) REFERENCES private_intent_revisions(id,version)
);
CREATE TABLE private_release_objects (
  sha256 char(64) PRIMARY KEY CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  byte_count integer NOT NULL CHECK (byte_count BETWEEN 0 AND 10485760),
  payload bytea NOT NULL CHECK (octet_length(payload)=byte_count),
  UNIQUE (sha256,byte_count)
);
CREATE TABLE private_release_asset_links (
  approval_id uuid NOT NULL REFERENCES private_release_approvals(id),
  path text NOT NULL,
  sha256 char(64) NOT NULL,
  byte_count integer NOT NULL,
  PRIMARY KEY (approval_id,path),
  FOREIGN KEY (sha256,byte_count) REFERENCES private_release_objects(sha256,byte_count)
);
CREATE TABLE private_release_signatures (
  approval_id uuid PRIMARY KEY REFERENCES private_release_approvals(id),
  signature text NOT NULL CHECK (signature ~ '^[A-Za-z0-9+/]{86}==$'),
  semantic_rationale text NOT NULL CHECK (length(semantic_rationale) BETWEEN 1 AND 4096)
);
CREATE FUNCTION reject_release_content_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'immutable_release_content';
END;
$$;
CREATE TRIGGER immutable_release_objects BEFORE UPDATE OR DELETE ON private_release_objects FOR EACH ROW EXECUTE FUNCTION reject_release_content_mutation();
CREATE TRIGGER immutable_release_links BEFORE UPDATE OR DELETE ON private_release_asset_links FOR EACH ROW EXECUTE FUNCTION reject_release_content_mutation();
CREATE TRIGGER immutable_release_signatures BEFORE UPDATE OR DELETE ON private_release_signatures FOR EACH ROW EXECUTE FUNCTION reject_release_content_mutation();
CREATE FUNCTION guard_release_candidate_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'immutable_release_candidate'; END IF;
  IF NEW.id<>OLD.id OR NEW.task_id<>OLD.task_id OR NEW.task_version<>OLD.task_version
    OR NEW.intent_id<>OLD.intent_id OR NEW.intent_version<>OLD.intent_version
    OR NEW.approved_intent_hash<>OLD.approved_intent_hash OR NEW.private_revision<>OLD.private_revision
    OR NEW.candidate<>OLD.candidate OR NEW.manifest_hash<>OLD.manifest_hash
    OR NEW.staged_by<>OLD.staged_by OR NEW.created_at<>OLD.created_at
    OR OLD.state<>'release_review' OR NEW.state<>'approved' OR NEW.version<>OLD.version+1
    OR NOT EXISTS (SELECT 1 FROM private_release_approvals AS approval JOIN private_release_signatures AS signature ON signature.approval_id=approval.id WHERE approval.id=NEW.id AND approval.manifest_hash=NEW.manifest_hash AND approval.task_id=NEW.task_id AND approval.task_version=NEW.task_version AND approval.private_revision=NEW.private_revision)
    THEN RAISE EXCEPTION 'invalid_release_candidate_transition'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER release_candidate_transition BEFORE UPDATE OR DELETE ON private_release_candidates FOR EACH ROW EXECUTE FUNCTION guard_release_candidate_transition();
