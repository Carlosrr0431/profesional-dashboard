-- =====================================================
-- MIGRACION: Trip transition también en INSERT
-- =====================================================
-- Objetivo:
-- 1) Mantener notificaciones en UPDATE (status/driver/cancel_reason)
-- 2) Agregar notificación en INSERT para viajes WhatsApp
--    (evita depender del cron para iniciar flujos inmediatos)

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.notify_whatsapp_trip_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notes TEXT;
  v_notes_norm TEXT;
  v_is_whatsapp_trip BOOLEAN;
  v_webhook_url TEXT;
  v_secret TEXT;
  v_previous_status TEXT := NULL;
BEGIN
  IF TG_OP NOT IN ('INSERT', 'UPDATE') THEN
    RETURN NEW;
  END IF;

  -- En UPDATE, ignorar cambios irrelevantes para evitar ruido.
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
  v_is_whatsapp_trip :=
    position('[approach_only]' IN v_notes_norm) > 0 OR
    position('whatsapp' IN v_notes_norm) > 0;

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
AFTER INSERT OR UPDATE OF status, driver_id, cancel_reason
ON public.trips
FOR EACH ROW
EXECUTE FUNCTION public.notify_whatsapp_trip_transition();

COMMENT ON FUNCTION public.notify_whatsapp_trip_transition()
IS 'Envia evento HTTP al endpoint de Agente_IA cuando se crea o cambia estado/chofer/cancelacion de viajes WhatsApp.';
