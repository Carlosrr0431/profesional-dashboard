-- Desbloquea un viaje atascado en pending reasignándolo a la cola
-- y excluyendo al chofer que ya lo rechazó o no respondió.
--
-- NO hace falta insertar en dispatch_queue a mano: el trigger
-- sync_dispatch_queue_from_trips lo hace al cambiar status -> queued.

BEGIN;

UPDATE public.trips
SET
  driver_id = NULL,
  origin_address = NULL,
  origin_lat = NULL,
  origin_lng = NULL,
  status = 'queued',
  dispatch_status = 'queued',
  assigned_at = NULL,
  accepted_at = NULL,
  next_dispatch_at = NOW(),
  status_updated_at = NOW(),
  cancel_reason = '[AUTO_REQUEUE] Chofer excluido manualmente para reasignar',
  wa_context = COALESCE(wa_context, '{}'::jsonb) || jsonb_build_object(
    'dispatch_excluded_driver_ids',
    to_jsonb(ARRAY(
      SELECT DISTINCT unnest(
        COALESCE(
          ARRAY(
            SELECT jsonb_array_elements_text(
              COALESCE(wa_context->'dispatch_excluded_driver_ids', '[]'::jsonb)
            )
          ),
          ARRAY[]::text[]
        ) || ARRAY['10c15319-05b7-4ced-8abd-d47982ce2fb1']
      )
    )),
    'dispatch_last_excluded_at', to_jsonb(NOW()::text),
    'dispatch_last_excluded_reason', to_jsonb('manual_unstick'::text)
  )
WHERE id = '1fa69feb-3afe-4cc8-a1bc-79b66c0bbadd'
  AND status IN ('pending', 'queued');

COMMIT;

-- Verificación
SELECT id, status, dispatch_status, driver_id, next_dispatch_at, wa_context
FROM public.trips
WHERE id = '1fa69feb-3afe-4cc8-a1bc-79b66c0bbadd';

SELECT trip_id, passenger_phone, queue_status, next_attempt_at, attempts_count
FROM public.dispatch_queue
WHERE trip_id = '1fa69feb-3afe-4cc8-a1bc-79b66c0bbadd';
