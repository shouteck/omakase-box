CREATE TABLE private_submission_imports (
  permit_id uuid PRIMARY KEY REFERENCES private_evaluations(permit_id),
  evaluation_id uuid NOT NULL REFERENCES private_evaluations(id),
  submission_hash char(64) NOT NULL CHECK (submission_hash ~ '^[a-f0-9]{64}$'),
  patch bytea NOT NULL CHECK (octet_length(patch) BETWEEN 1 AND 1048576),
  envelope jsonb NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION private_submission_import_immutable() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'submission_import_immutable';
END;
$fn$;
CREATE TRIGGER private_submission_import_guard BEFORE UPDATE OR DELETE ON private_submission_imports FOR EACH ROW EXECUTE FUNCTION private_submission_import_immutable();
