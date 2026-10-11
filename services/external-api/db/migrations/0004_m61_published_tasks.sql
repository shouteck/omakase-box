CREATE TABLE external_bridge_claims (
  event_id uuid PRIMARY KEY,
  nonce uuid NOT NULL,
  payload_hash char(64) NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  task_id uuid NOT NULL,
  task_version integer NOT NULL CHECK (task_version BETWEEN 1 AND 2147483647),
  manifest_hash char(64) NOT NULL CHECK (manifest_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_bridge_claims_nonce_unique UNIQUE (nonce)
);

CREATE TABLE external_published_tasks (
  event_id uuid PRIMARY KEY REFERENCES external_bridge_claims(event_id),
  task_id uuid NOT NULL,
  lineage_id uuid NOT NULL,
  version integer NOT NULL CHECK (version BETWEEN 1 AND 2147483647),
  manifest_hash char(64) NOT NULL CHECK (manifest_hash ~ '^[a-f0-9]{64}$'),
  payload_hash char(64) NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  package_sha256 char(64) NOT NULL CHECK (package_sha256 ~ '^[a-f0-9]{64}$'),
  package_byte_size integer NOT NULL CHECK (package_byte_size BETWEEN 1 AND 134217728 AND package_byte_size = octet_length(package_bytes)),
  package_bytes bytea NOT NULL CHECK (octet_length(package_bytes) BETWEEN 1 AND 134217728),
  contract jsonb NOT NULL,
  listing jsonb NOT NULL,
  manifest jsonb NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_published_task_content_unique UNIQUE (task_id, version)
);

CREATE INDEX external_published_tasks_board ON external_published_tasks (published_at, task_id, version);

CREATE FUNCTION external_released_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'released_data_immutable';
END;
$$;
CREATE TRIGGER external_bridge_claims_append_only BEFORE UPDATE OR DELETE ON external_bridge_claims FOR EACH ROW EXECUTE FUNCTION external_released_immutable();
CREATE TRIGGER external_published_tasks_append_only BEFORE UPDATE OR DELETE ON external_published_tasks FOR EACH ROW EXECUTE FUNCTION external_released_immutable();
