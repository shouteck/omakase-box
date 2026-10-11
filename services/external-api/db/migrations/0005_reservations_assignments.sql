
CREATE TABLE external_task_assignments (
  id uuid PRIMARY KEY,
  task_id uuid NOT NULL,
  task_version integer NOT NULL CHECK (task_version BETWEEN 1 AND 2147483647),
  executor_kind varchar(8) NOT NULL CHECK (executor_kind IN ('human','ai','team')),
  executor_label text NOT NULL,
  contributor_id uuid REFERENCES external_accounts(id),
  status varchar(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open','active','expired','completed','withdrawn')),
  chosen_by text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_task_assignment_content UNIQUE (task_id, task_version),
  CONSTRAINT external_task_assignment_contributor_shape CHECK (
    (executor_kind = 'human' AND contributor_id IS NOT NULL) OR (executor_kind <> 'human' AND contributor_id IS NULL)
  )
);

CREATE TABLE external_task_invitations (
  id uuid PRIMARY KEY,
  assignment_id uuid NOT NULL REFERENCES external_task_assignments(id),
  token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  contributor_id uuid NOT NULL REFERENCES external_accounts(id),
  expires_at timestamptz NOT NULL,
  revoked boolean NOT NULL DEFAULT false,
  redeemed_at timestamptz,
  CONSTRAINT external_task_invitation_one_active UNIQUE (assignment_id)
);

CREATE TABLE external_reservation_attempts (
  submission_id uuid PRIMARY KEY,
  reservation_id uuid NOT NULL REFERENCES external_reservations(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  superseded boolean NOT NULL DEFAULT false
);
CREATE INDEX external_reservation_attempts_live ON external_reservation_attempts (reservation_id) WHERE NOT superseded;

CREATE TABLE external_package_defect_reports (
  id uuid PRIMARY KEY,
  reservation_id uuid NOT NULL REFERENCES external_reservations(id),
  contributor_id uuid NOT NULL REFERENCES external_accounts(id),
  task_id uuid NOT NULL,
  task_version integer NOT NULL CHECK (task_version BETWEEN 1 AND 2147483647),
  category varchar(48) NOT NULL CHECK (category IN ('missing_context','missing_dependency','environment_failure','documentation_failure','other')),
  description text NOT NULL CHECK (char_length(description) BETWEEN 12 AND 4000),
  idempotency_key uuid NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_package_defect_idempotency UNIQUE (contributor_id, idempotency_key)
);

CREATE INDEX external_package_defect_reports_reservation ON external_package_defect_reports (reservation_id, received_at);

CREATE FUNCTION external_reservation_record_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'external_task_assignments' AND TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'assignment_records_preserved';
  END IF;
  IF TG_TABLE_NAME = 'external_package_defect_reports' THEN
    RAISE EXCEPTION 'defect_reports_immutable';
  END IF;
  IF TG_TABLE_NAME = 'external_reservation_attempts' AND TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'attempt_lineage_preserved';
  END IF;
  IF TG_TABLE_NAME = 'external_task_invitations' AND TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'invitation_records_preserved';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME = 'external_task_assignments' THEN
      IF OLD.id IS DISTINCT FROM NEW.id OR OLD.task_id IS DISTINCT FROM NEW.task_id OR OLD.task_version IS DISTINCT FROM NEW.task_version
        OR OLD.executor_kind IS DISTINCT FROM NEW.executor_kind OR OLD.executor_label IS DISTINCT FROM NEW.executor_label
        OR OLD.contributor_id IS DISTINCT FROM NEW.contributor_id OR OLD.chosen_by IS DISTINCT FROM NEW.chosen_by
        OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
        RAISE EXCEPTION 'assignment_choice_immutable';
      END IF;
    END IF;
    IF TG_TABLE_NAME = 'external_task_invitations' THEN
      IF OLD.id IS DISTINCT FROM NEW.id OR OLD.assignment_id IS DISTINCT FROM NEW.assignment_id
        OR OLD.token_hash IS DISTINCT FROM NEW.token_hash OR OLD.contributor_id IS DISTINCT FROM NEW.contributor_id THEN
        RAISE EXCEPTION 'invitation_binding_immutable';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
ALTER TABLE external_reservations ADD COLUMN reserved_at timestamptz NOT NULL DEFAULT now();
CREATE TRIGGER external_task_assignments_preserved BEFORE DELETE ON external_task_assignments FOR EACH ROW EXECUTE FUNCTION external_reservation_record_guard();
CREATE TRIGGER external_task_assignments_choice_immutable BEFORE UPDATE ON external_task_assignments FOR EACH ROW EXECUTE FUNCTION external_reservation_record_guard();
CREATE TRIGGER external_task_invitations_preserved BEFORE DELETE ON external_task_invitations FOR EACH ROW EXECUTE FUNCTION external_reservation_record_guard();
CREATE TRIGGER external_task_invitations_binding_immutable BEFORE UPDATE ON external_task_invitations FOR EACH ROW EXECUTE FUNCTION external_reservation_record_guard();
CREATE TRIGGER external_reservation_attempts_preserved BEFORE DELETE ON external_reservation_attempts FOR EACH ROW EXECUTE FUNCTION external_reservation_record_guard();
CREATE TRIGGER external_package_defect_reports_immutable BEFORE UPDATE OR DELETE ON external_package_defect_reports FOR EACH ROW EXECUTE FUNCTION external_reservation_record_guard();

CREATE TABLE external_assignment_command_claims (
  event_id uuid PRIMARY KEY,
  nonce uuid NOT NULL UNIQUE,
  assignment_id uuid NOT NULL,
  task_id uuid NOT NULL,
  task_version integer NOT NULL CHECK (task_version > 0),
  package_digest char(64) NOT NULL CHECK (package_digest ~ '^[a-f0-9]{64}$'),
  payload_hash char(64) NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$')
);
CREATE FUNCTION external_assignment_claim_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'assignment_claim_immutable';
END;
$$;
CREATE TRIGGER external_assignment_claim_preserved BEFORE UPDATE OR DELETE ON external_assignment_command_claims FOR EACH ROW EXECUTE FUNCTION external_assignment_claim_immutable();
