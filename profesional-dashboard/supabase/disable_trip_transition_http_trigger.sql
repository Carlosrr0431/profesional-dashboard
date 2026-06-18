-- Objetivo:
-- Desactivar definitivamente el callback HTTP de trip.transition para evitar loops de POST
-- al endpoint /api/Agente_IA cuando se usa dispatch DB-first.
--
-- Script idempotente: se puede ejecutar varias veces.

BEGIN;

-- 1) Desactivar trigger que invoca notify_whatsapp_trip_transition.
DROP TRIGGER IF EXISTS trg_notify_whatsapp_trip_transition ON public.trips;

-- 2) Vaciar URL y secret para evitar reactivaciones accidentales por config.
UPDATE public.settings
SET value = '',
    updated_at = NOW()
WHERE key IN ('whatsapp_trip_transition_url', 'whatsapp_trip_transition_secret');

COMMIT;

-- Verificacion:
-- a) trigger debe quedar ausente
SELECT tgname
FROM pg_trigger
WHERE tgrelid = 'public.trips'::regclass
  AND tgname = 'trg_notify_whatsapp_trip_transition'
  AND NOT tgisinternal;

-- b) settings deben quedar vacios
SELECT key, value, updated_at
FROM public.settings
WHERE key IN ('whatsapp_trip_transition_url', 'whatsapp_trip_transition_secret')
ORDER BY key;
