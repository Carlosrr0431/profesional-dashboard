CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.notify_whatsapp_trip_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notes TEXT := COALESCE(NEW.notes, '');
  v_notes_norm TEXT := lower(v_notes);
  v_is_whatsapp_trip BOOLEAN :=
    position('[approach_only]' IN v_notes_norm) > 0 OR
    position('whatsapp' IN v_notes_norm) > 0;
  v_webhook_url TEXT;
  v_secret TEXT;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.driver_id IS NOT DISTINCT FROM OLD.driver_id
     AND NEW.cancel_reason IS NOT DISTINCT FROM OLD.cancel_reason THEN
    RETURN NEW;
  END IF;

  IF NOT v_is_whatsapp_trip THEN
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
      'previousStatus', OLD.status,
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
IS 'Envia evento HTTP al endpoint de Agente_IA cuando cambia estado/chofer/cancelacion de viajes WhatsApp.';

-- Configuracion requerida (ejecutar en SQL editor con valores reales):
INSERT INTO public.settings (key, value, updated_at)
VALUES
  ('whatsapp_trip_transition_url', 'https://profesional-dashboard.vercel.app/api/Agente_IA', NOW()),
  ('whatsapp_trip_transition_secret', '49225fc6fbe7dfb8bdef9177e2fef58ebaec023e3e74be0fe7c709d2357e3a13', NOW())
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = NOW();
