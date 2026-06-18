-- Push pasajeros + trigger trip.transition (WhatsApp y app de pasajeros).
-- Ejecutar TODO este archivo en el editor SQL de Supabase.

-- ============================================================
-- 1. Tabla passenger_devices (tokens FCM por teléfono)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.passenger_devices (
  phone       TEXT        PRIMARY KEY,
  push_token  TEXT        NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_passenger_devices_updated
  ON public.passenger_devices (updated_at DESC);

ALTER TABLE public.passenger_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "passenger_upsert_device" ON public.passenger_devices;
CREATE POLICY "passenger_upsert_device"
  ON public.passenger_devices
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 2. Trigger HTTP → Agente_IA
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.notify_whatsapp_trip_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notes TEXT;
  v_notes_norm TEXT;
  v_should_notify BOOLEAN;
  v_webhook_url TEXT;
  v_secret TEXT;
  v_previous_status TEXT := NULL;
BEGIN
  IF TG_OP NOT IN ('INSERT', 'UPDATE') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS NOT DISTINCT FROM OLD.status
       AND NEW.driver_id IS NOT DISTINCT FROM OLD.driver_id
       AND NEW.cancel_reason IS NOT DISTINCT FROM OLD.cancel_reason THEN
      RETURN NEW;
    END IF;
    v_previous_status := OLD.status;
    v_notes := COALESCE(NEW.notes, OLD.notes, '');
  ELSE
    v_notes := COALESCE(NEW.notes, '');
  END IF;

  v_notes_norm := lower(v_notes);
  v_should_notify :=
    position('[approach_only]' IN v_notes_norm) > 0 OR
    position('[passenger_app]' IN v_notes_norm) > 0 OR
    position('whatsapp' IN v_notes_norm) > 0;

  IF NOT v_should_notify THEN
    RETURN NEW;
  END IF;

  SELECT value
  INTO v_webhook_url
  FROM public.settings
  WHERE key = 'whatsapp_trip_transition_url'
  LIMIT 1;

  SELECT value
  INTO v_secret
  FROM public.settings
  WHERE key = 'whatsapp_trip_transition_secret'
  LIMIT 1;

  IF v_webhook_url IS NULL OR btrim(v_webhook_url) = '' THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    v_webhook_url,
    jsonb_build_object(
      'event', 'trip.transition',
      'tripId', NEW.id,
      'status', NEW.status,
      'previousStatus', v_previous_status,
      'driverId', NEW.driver_id,
      'cancelReason', NEW.cancel_reason,
      'updatedAt', NOW()
    ),
    '{}'::jsonb,
    jsonb_build_object(
      'Content-Type', 'application/json',
      'x-trip-transition-secret', COALESCE(v_secret, '')
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_whatsapp_trip_transition ON public.trips;

CREATE TRIGGER trg_notify_whatsapp_trip_transition
AFTER UPDATE OF status, driver_id, cancel_reason
ON public.trips
FOR EACH ROW
EXECUTE FUNCTION public.notify_whatsapp_trip_transition();

COMMENT ON FUNCTION public.notify_whatsapp_trip_transition()
IS 'Envía trip.transition al dashboard en viajes WhatsApp y app de pasajeros.';
