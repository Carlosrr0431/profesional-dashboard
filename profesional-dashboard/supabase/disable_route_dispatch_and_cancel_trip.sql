-- Objetivo:
-- 1) Cancelar un viaje problematico en forma consistente.
-- 2) Limpiar cola/locks de los esquemas v1 y v2.
-- 3) Apagar el trigger HTTP que dispara POST /api/Agente_IA desde Postgres.
--
-- Ejecutar en Supabase SQL Editor.

BEGIN;

-- 1) Cancelacion manual del viaje.
UPDATE public.trips
SET
  status = 'cancelled',
  cancel_reason = '[MANUAL_CANCEL] Cancelado por operador para cortar loop de dispatch.',
  driver_id = NULL,
  assigned_at = NULL,
  accepted_at = NULL,
  pickup_at = NULL,
  started_at = NULL,
  wa_notified_at = COALESCE(wa_notified_at, NOW()),
  dispatch_status = 'cancelled',
  dispatch_token = NULL,
  next_dispatch_at = NULL
WHERE id = 'e031e6a3-2a42-42e3-aacd-68965b526f96'::uuid
  AND status IN ('queued', 'pending', 'accepted', 'going_to_pickup', 'in_progress');

-- 2) Limpieza de colas (compatible con migracion vieja y nueva).
DO $$
BEGIN
  IF to_regclass('public.dispatch_queue') IS NOT NULL THEN
    DELETE FROM public.dispatch_queue
    WHERE trip_id = 'e031e6a3-2a42-42e3-aacd-68965b526f96'::uuid;
  END IF;

  IF to_regclass('public.trip_dispatch_queue') IS NOT NULL THEN
    DELETE FROM public.trip_dispatch_queue
    WHERE trip_id = 'e031e6a3-2a42-42e3-aacd-68965b526f96'::uuid;
  END IF;
END $$;

-- 3) Apagar callbacks HTTP desde BD para evitar POST infinitos al route.
DROP TRIGGER IF EXISTS trg_notify_whatsapp_trip_transition ON public.trips;

UPDATE public.settings
SET value = '',
    updated_at = NOW()
WHERE key = 'whatsapp_trip_transition_url';

COMMIT;

-- Verificacion rapida.
SELECT
  id,
  status,
  cancel_reason,
  dispatch_status,
  next_dispatch_at,
  row_version
FROM public.trips
WHERE id = 'e031e6a3-2a42-42e3-aacd-68965b526f96'::uuid;
