
CREATE TABLE private_assignments (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES private_accounts(id),
  idempotency_key uuid NOT NULL,
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  task_id uuid NOT NULL,
  task_version integer NOT NULL CHECK (task_version > 0),
  package_digest char(64) NOT NULL CHECK (package_digest ~ '^[a-f0-9]{64}$'),
  executor jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id,idempotency_key),
  UNIQUE (task_id,task_version)
);
CREATE TABLE private_assignment_invitations (
  assignment_id uuid PRIMARY KEY REFERENCES private_assignments(id),
  contributor_id uuid NOT NULL,
  token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  token char(64) NOT NULL CHECK (token ~ '^[a-f0-9]{64}$'),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE TABLE private_assignment_outbox (
  event_id uuid PRIMARY KEY,
  assignment_id uuid NOT NULL REFERENCES private_assignments(id),
  kind varchar(32) NOT NULL DEFAULT 'choice' CHECK (kind IN ('choice','invitation_revocation')),
  packet jsonb NOT NULL,
  payload_hash char(64) NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id,kind)
);
CREATE FUNCTION private_assignment_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'assignment_record_immutable';
END;
$$;
CREATE TRIGGER private_assignment_choice_immutable BEFORE UPDATE OR DELETE ON private_assignments FOR EACH ROW EXECUTE FUNCTION private_assignment_immutable();
CREATE FUNCTION private_assignment_invitation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'invitation_records_preserved'; END IF;
  IF ROW(OLD.assignment_id,OLD.contributor_id,OLD.token_hash,OLD.token,OLD.issued_at,OLD.expires_at) IS DISTINCT FROM ROW(NEW.assignment_id,NEW.contributor_id,NEW.token_hash,NEW.token,NEW.issued_at,NEW.expires_at)
    OR OLD.revoked_at IS NOT NULL AND OLD.revoked_at IS DISTINCT FROM NEW.revoked_at THEN
    RAISE EXCEPTION 'invitation_binding_immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER private_assignment_invitation_preserved BEFORE UPDATE OR DELETE ON private_assignment_invitations FOR EACH ROW EXECUTE FUNCTION private_assignment_invitation_guard();
CREATE FUNCTION private_assignment_outbox_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'assignment_outbox_preserved'; END IF;
  IF ROW(OLD.event_id,OLD.assignment_id,OLD.kind,OLD.packet,OLD.payload_hash,OLD.created_at) IS DISTINCT FROM ROW(NEW.event_id,NEW.assignment_id,NEW.kind,NEW.packet,NEW.payload_hash,NEW.created_at)
    OR OLD.delivered_at IS NOT NULL AND OLD.delivered_at IS DISTINCT FROM NEW.delivered_at THEN
    RAISE EXCEPTION 'assignment_outbox_immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER private_assignment_outbox_preserved BEFORE UPDATE OR DELETE ON private_assignment_outbox FOR EACH ROW EXECUTE FUNCTION private_assignment_outbox_guard();

CREATE TABLE private_assignment_delivery_attempts (
  event_id uuid PRIMARY KEY,
  outbox_event_id uuid NOT NULL REFERENCES private_assignment_outbox(event_id),
  sequence integer NOT NULL CHECK (sequence > 0),
  nonce uuid NOT NULL UNIQUE,
  packet jsonb NOT NULL,
  payload_hash char(64) NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  receipt jsonb,
  acknowledged_at timestamptz,
  UNIQUE (outbox_event_id,sequence),
  UNIQUE (event_id,outbox_event_id),
  CHECK ((receipt IS NULL) = (acknowledged_at IS NULL))
);
CREATE TABLE private_assignment_delivery_leases (
  outbox_event_id uuid PRIMARY KEY REFERENCES private_assignment_outbox(event_id),
  event_id uuid NOT NULL,
  token_hash char(64) NOT NULL CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  leased_until timestamptz NOT NULL,
  FOREIGN KEY (event_id,outbox_event_id) REFERENCES private_assignment_delivery_attempts(event_id,outbox_event_id)
);
CREATE FUNCTION private_assignment_delivery_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'delivery_history_preserved'; END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT packet->'payload' INTO original FROM private_assignment_outbox WHERE event_id=NEW.outbox_event_id;
    IF original IS NULL OR ((NEW.packet->'payload') - ARRAY['eventId','nonce','issuedAt','expiresAt']) IS DISTINCT FROM (original - ARRAY['eventId','nonce','issuedAt','expiresAt'])
      OR NEW.packet->'payload'->>'eventId' IS DISTINCT FROM NEW.event_id::text
      OR NEW.packet->'payload'->>'nonce' IS DISTINCT FROM NEW.nonce::text
      OR (NEW.packet->'payload'->>'expiresAt')::timestamptz IS DISTINCT FROM NEW.expires_at THEN
      RAISE EXCEPTION 'delivery_choice_binding';
    END IF;
  ELSE
    IF ROW(OLD.event_id,OLD.outbox_event_id,OLD.sequence,OLD.nonce,OLD.packet,OLD.payload_hash,OLD.expires_at) IS DISTINCT FROM ROW(NEW.event_id,NEW.outbox_event_id,NEW.sequence,NEW.nonce,NEW.packet,NEW.payload_hash,NEW.expires_at)
      OR OLD.receipt IS NOT NULL AND ROW(OLD.receipt,OLD.acknowledged_at) IS DISTINCT FROM ROW(NEW.receipt,NEW.acknowledged_at) THEN
      RAISE EXCEPTION 'delivery_attempt_immutable';
    END IF;
  END IF;
  IF NEW.receipt IS NOT NULL AND (NEW.receipt->'payload'->>'eventId' IS DISTINCT FROM NEW.event_id::text OR NEW.receipt->'payload'->>'commandHash' IS DISTINCT FROM NEW.payload_hash::text) THEN
    RAISE EXCEPTION 'delivery_receipt_binding';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER private_assignment_delivery_preserved BEFORE INSERT OR UPDATE OR DELETE ON private_assignment_delivery_attempts FOR EACH ROW EXECUTE FUNCTION private_assignment_delivery_guard();
