-- One-shot: limpia estadística histórica y deja solo viajes de HOY
-- (sábado 19/09/2026, America/Argentina/Buenos_Aires).
--
-- Qué borra: viajes CERRADOS (completed / cancelled / otros no operativos)
--            con created_at < 2026-09-19 00:00:00 ART.
-- Qué conserva:
--   - todos los viajes creados hoy (cualquier estado)
--   - viajes operativos abiertos aunque se hayan creado antes
--     (pending, queued, scheduled, accepted, going_to_pickup,
--      in_progress, awaiting_address_selection)
-- No toca: drivers, settings, tarifas, deudas de comisión.
--
-- Ejecutar una vez en Supabase SQL Editor. Re-ejecutar es idempotente
-- respecto de este corte (no borra viajes de hoy ni posteriores).

BEGIN;

ALTER TABLE public.whatsapp_conversations
  DROP CONSTRAINT IF EXISTS whatsapp_conversations_last_trip_id_fkey;

ALTER TABLE public.whatsapp_conversations
  ADD CONSTRAINT whatsapp_conversations_last_trip_id_fkey
    FOREIGN KEY (last_trip_id)
    REFERENCES public.trips(id)
    ON DELETE SET NULL;

DO $$
DECLARE
  v_cutoff timestamptz := TIMESTAMPTZ '2026-09-19 00:00:00-03';
  v_open text[] := ARRAY[
    'pending',
    'queued',
    'scheduled',
    'accepted',
    'going_to_pickup',
    'in_progress',
    'awaiting_address_selection'
  ];
  v_deleted int := 0;
  v_batch int;
BEGIN
  UPDATE public.whatsapp_conversations c
  SET last_trip_id = NULL
  WHERE c.last_trip_id IN (
    SELECT t.id
    FROM public.trips t
    WHERE t.created_at < v_cutoff
      AND lower(coalesce(t.status, '')) <> ALL (v_open)
  );

  IF to_regclass('public.commission_accumulation_log') IS NOT NULL THEN
    EXECUTE $q$
      DELETE FROM public.commission_accumulation_log l
      WHERE l.trip_id IN (
        SELECT t.id
        FROM public.trips t
        WHERE t.created_at < $1
          AND lower(coalesce(t.status, '')) <> ALL ($2)
      )
    $q$ USING v_cutoff, v_open;
  END IF;

  LOOP
    DELETE FROM public.trips
    WHERE id IN (
      SELECT id
      FROM public.trips
      WHERE created_at < v_cutoff
        AND lower(coalesce(status, '')) <> ALL (v_open)
      LIMIT 400
    );
    GET DIAGNOSTICS v_batch = ROW_COUNT;
    v_deleted := v_deleted + v_batch;
    EXIT WHEN v_batch = 0;
  END LOOP;

  RAISE NOTICE 'deleted_closed_trips_before_2026_09_19=%', v_deleted;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'drivers'
      AND column_name = 'total_trips'
  ) THEN
    UPDATE public.drivers SET total_trips = 0;

    UPDATE public.drivers d
    SET total_trips = s.cnt
    FROM (
      SELECT driver_id, count(*)::int AS cnt
      FROM public.trips
      WHERE lower(status) = 'completed'
        AND driver_id IS NOT NULL
      GROUP BY driver_id
    ) s
    WHERE d.id = s.driver_id;
  END IF;
END $$;

COMMIT;

-- Verificación (correr después del COMMIT)
SELECT
  count(*) FILTER (
    WHERE created_at >= TIMESTAMPTZ '2026-09-19 00:00:00-03'
  ) AS trips_today,
  count(*) FILTER (
    WHERE created_at < TIMESTAMPTZ '2026-09-19 00:00:00-03'
  ) AS trips_before_today_kept,
  count(*) FILTER (
    WHERE created_at < TIMESTAMPTZ '2026-09-19 00:00:00-03'
      AND lower(status) IN ('completed', 'cancelled')
  ) AS closed_before_today_should_be_zero,
  count(*) AS trips_total
FROM public.trips;
