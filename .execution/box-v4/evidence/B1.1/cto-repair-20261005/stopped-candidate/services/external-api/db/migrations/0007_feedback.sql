CREATE FUNCTION external_feedback_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'external_feedback_immutable';
END $$;
CREATE TRIGGER external_feedback_immutability_guard BEFORE UPDATE OR DELETE ON external_feedback FOR EACH ROW EXECUTE FUNCTION external_feedback_integrity();
