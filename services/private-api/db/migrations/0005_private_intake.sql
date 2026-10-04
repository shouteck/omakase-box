CREATE TABLE private_intake_objects (
  sha256 char(64) PRIMARY KEY CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  byte_count integer NOT NULL CHECK (byte_count BETWEEN 0 AND 1048576),
  payload bytea NOT NULL,
  UNIQUE (sha256,byte_count),
  CHECK (octet_length(payload)=byte_count)
);
CREATE TABLE private_snapshots (
  id uuid PRIMARY KEY,
  snapshot_hash char(64) NOT NULL UNIQUE CHECK (snapshot_hash ~ '^[a-f0-9]{64}$'),
  manifest jsonb NOT NULL,
  file_count integer NOT NULL CHECK (file_count BETWEEN 1 AND 256),
  registered_by uuid NOT NULL REFERENCES private_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_array_length(manifest->'files')=file_count)
);
CREATE TABLE private_snapshot_provenance (
  id uuid PRIMARY KEY,
  snapshot_id uuid NOT NULL REFERENCES private_snapshots(id),
  source_id varchar(64) NOT NULL,
  source_root text NOT NULL,
  actor_id uuid NOT NULL REFERENCES private_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE private_requests (
  id uuid PRIMARY KEY,
  snapshot_id uuid NOT NULL REFERENCES private_snapshots(id),
  requester_id uuid NOT NULL REFERENCES private_accounts(id),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (payload->>'snapshotId'=snapshot_id::text),
  CHECK (octet_length(payload::text)<=65536)
);
CREATE TABLE private_request_evidence (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES private_requests(id),
  sha256 char(64) NOT NULL,
  byte_count integer NOT NULL CHECK (byte_count BETWEEN 1 AND 1048576),
  media_type text NOT NULL CHECK (media_type IN ('text/plain','image/png','image/jpeg')),
  label varchar(160) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (sha256,byte_count) REFERENCES private_intake_objects(sha256,byte_count),
  CHECK (media_type<>'text/plain' OR byte_count<=65536)
);
CREATE FUNCTION reject_private_intake_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'private_intake_immutable' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER private_intake_objects_immutable BEFORE UPDATE ON private_intake_objects FOR EACH ROW EXECUTE FUNCTION reject_private_intake_update();
CREATE TRIGGER private_snapshots_immutable BEFORE UPDATE ON private_snapshots FOR EACH ROW EXECUTE FUNCTION reject_private_intake_update();
CREATE TRIGGER private_snapshot_provenance_immutable BEFORE UPDATE ON private_snapshot_provenance FOR EACH ROW EXECUTE FUNCTION reject_private_intake_update();
CREATE TRIGGER private_requests_immutable BEFORE UPDATE ON private_requests FOR EACH ROW EXECUTE FUNCTION reject_private_intake_update();
CREATE TRIGGER private_request_evidence_immutable BEFORE UPDATE ON private_request_evidence FOR EACH ROW EXECUTE FUNCTION reject_private_intake_update();
CREATE FUNCTION bound_private_request_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE evidence_count integer; evidence_bytes bigint;
BEGIN
  PERFORM id FROM private_requests WHERE id=NEW.request_id FOR UPDATE;
  SELECT count(*),coalesce(sum(byte_count),0) INTO evidence_count,evidence_bytes FROM private_request_evidence WHERE request_id=NEW.request_id;
  IF evidence_count>=16 OR evidence_bytes+NEW.byte_count>8388608 THEN
    RAISE EXCEPTION 'private_evidence_limit' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER private_request_evidence_budget BEFORE INSERT ON private_request_evidence FOR EACH ROW EXECUTE FUNCTION bound_private_request_evidence();
