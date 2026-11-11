-- A submitted form owns one immutable notification context and one native plan.
CREATE TABLE portal_form_notification_runs (
 record_id uuid PRIMARY KEY REFERENCES portal_form_records(id),
 owner_id uuid REFERENCES users(id),
 context jsonb NOT NULL CHECK (jsonb_typeof(context)='object'),
 planned_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE portal_form_notification_deliveries (
 id uuid PRIMARY KEY,
 record_id uuid NOT NULL REFERENCES portal_form_notification_runs(record_id),
 ordinal integer NOT NULL CHECK (ordinal BETWEEN 1 AND 100),
 notification_slug text NOT NULL,
 payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
 status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','sending','delivered','review')),
 attempt_token uuid,
 sending_started_at timestamptz,
 delivered_at timestamptz,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (record_id,ordinal),
 CHECK ((status='delivered')=(delivered_at IS NOT NULL)),
 CHECK (status<>'sending' OR (attempt_token IS NOT NULL AND sending_started_at IS NOT NULL))
);
CREATE INDEX portal_form_notifications_review ON portal_form_notification_deliveries(status,created_at) WHERE status='review';

CREATE FUNCTION portal_form_notification_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='portal_form_notification_runs' THEN
  IF NEW.record_id IS DISTINCT FROM OLD.record_id OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.context IS DISTINCT FROM OLD.context OR (OLD.planned_at IS NOT NULL AND NEW.planned_at IS DISTINCT FROM OLD.planned_at) THEN
   RAISE EXCEPTION 'Submitted notification context is immutable';
  END IF;
 ELSE
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.record_id IS DISTINCT FROM OLD.record_id
     OR NEW.ordinal IS DISTINCT FROM OLD.ordinal OR NEW.notification_slug IS DISTINCT FROM OLD.notification_slug
     OR NEW.payload IS DISTINCT FROM OLD.payload OR (OLD.status<>'planned' AND NEW.status='planned')
     OR (OLD.status='delivered' AND NEW IS DISTINCT FROM OLD) THEN
   RAISE EXCEPTION 'Submitted notification plan is immutable';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER portal_form_notification_context_changes BEFORE UPDATE ON portal_form_notification_runs
FOR EACH ROW EXECUTE FUNCTION portal_form_notification_immutable();
CREATE TRIGGER portal_form_notification_delivery_changes BEFORE UPDATE ON portal_form_notification_deliveries
FOR EACH ROW EXECUTE FUNCTION portal_form_notification_immutable();

ALTER TABLE portal_form_notification_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_form_notification_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE portal_form_notification_runs,portal_form_notification_deliveries FROM PUBLIC;
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  EXECUTE 'REVOKE ALL ON TABLE portal_form_notification_runs,portal_form_notification_deliveries FROM anon';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  EXECUTE 'REVOKE ALL ON TABLE portal_form_notification_runs,portal_form_notification_deliveries FROM authenticated';
 END IF;
END;
$$;
