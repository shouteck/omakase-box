CREATE FUNCTION private_intent_head_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.current_version <> 1 THEN RAISE EXCEPTION 'invalid_initial_intent_head'; END IF;
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.current_version <> OLD.current_version + 1 THEN RAISE EXCEPTION 'stale_intent_head'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER private_intent_head_integrity_guard BEFORE INSERT OR UPDATE ON private_intent_heads FOR EACH ROW EXECUTE FUNCTION private_intent_head_integrity();
