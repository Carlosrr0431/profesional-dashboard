-- Oferta en simultáneo: el viaje queda pending sin chofer hasta que el primero acepta.
-- Pegar una vez en el editor SQL de Supabase.

CREATE TABLE IF NOT EXISTS public.trip_dispatch_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  offered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  UNIQUE (trip_id, driver_id)
);

CREATE INDEX IF NOT EXISTS trip_dispatch_offers_driver_pending_idx
  ON public.trip_dispatch_offers (driver_id, offered_at DESC)
  WHERE status = 'pending';

ALTER TABLE public.trip_dispatch_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Chofer ve sus ofertas" ON public.trip_dispatch_offers;
CREATE POLICY "Chofer ve sus ofertas"
  ON public.trip_dispatch_offers
  FOR SELECT
  TO authenticated
  USING (driver_id = (SELECT public.get_my_driver_id()));

DROP POLICY IF EXISTS "Chofer lee viaje ofertado" ON public.trips;
CREATE POLICY "Chofer lee viaje ofertado"
  ON public.trips
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.trip_dispatch_offers o
      WHERE o.trip_id = trips.id
        AND o.driver_id = (SELECT public.get_my_driver_id())
        AND o.status = 'pending'
    )
  );

CREATE OR REPLACE FUNCTION public.claim_dispatch_offer(p_trip_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_id UUID;
  v_trip public.trips%ROWTYPE;
BEGIN
  v_driver_id := public.get_my_driver_id();
  IF v_driver_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'driver_not_found');
  END IF;

  SELECT * INTO v_trip
  FROM public.trips
  WHERE id = p_trip_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'trip_not_found');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.trip_dispatch_offers
    WHERE trip_id = p_trip_id
      AND driver_id = v_driver_id
      AND status = 'pending'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'offer_not_pending', 'taken', true);
  END IF;

  IF v_trip.status IS DISTINCT FROM 'pending' OR v_trip.driver_id IS NOT NULL THEN
    UPDATE public.trip_dispatch_offers
    SET status = 'lost', resolved_at = NOW()
    WHERE trip_id = p_trip_id
      AND driver_id = v_driver_id
      AND status = 'pending';
    RETURN jsonb_build_object('success', false, 'error', 'trip_taken', 'taken', true);
  END IF;

  UPDATE public.trips
  SET
    driver_id = v_driver_id,
    status = 'going_to_pickup',
    accepted_at = NOW(),
    dispatch_status = 'accepted'
  WHERE id = p_trip_id;

  UPDATE public.trip_dispatch_offers
  SET status = 'accepted', resolved_at = NOW()
  WHERE trip_id = p_trip_id AND driver_id = v_driver_id;

  UPDATE public.trip_dispatch_offers
  SET status = 'lost', resolved_at = NOW()
  WHERE trip_id = p_trip_id
    AND driver_id IS DISTINCT FROM v_driver_id
    AND status = 'pending';

  SELECT * INTO v_trip FROM public.trips WHERE id = p_trip_id;
  RETURN jsonb_build_object('success', true, 'trip', to_jsonb(v_trip));
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_dispatch_offer(
  p_trip_id UUID,
  p_reason TEXT DEFAULT 'Rechazado por chofer'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_id UUID;
  v_remaining INTEGER;
  v_trip public.trips%ROWTYPE;
BEGIN
  v_driver_id := public.get_my_driver_id();
  IF v_driver_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'driver_not_found');
  END IF;

  UPDATE public.trip_dispatch_offers
  SET status = 'rejected', resolved_at = NOW()
  WHERE trip_id = p_trip_id
    AND driver_id = v_driver_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true, 'remaining', 0);
  END IF;

  SELECT COUNT(*) INTO v_remaining
  FROM public.trip_dispatch_offers
  WHERE trip_id = p_trip_id AND status = 'pending';

  SELECT * INTO v_trip FROM public.trips WHERE id = p_trip_id FOR UPDATE;

  IF v_trip.id IS NOT NULL AND v_trip.driver_id IS NULL AND v_trip.status = 'pending' THEN
    UPDATE public.trips
    SET wa_context = COALESCE(wa_context, '{}'::jsonb) || jsonb_build_object(
      'dispatch_excluded_driver_ids',
      (
        SELECT COALESCE(jsonb_agg(DISTINCT value), '[]'::jsonb)
        FROM (
          SELECT jsonb_array_elements_text(COALESCE(v_trip.wa_context->'dispatch_excluded_driver_ids', '[]'::jsonb)) AS value
          UNION
          SELECT v_driver_id::text
        ) ids
      ),
      'dispatch_permanent_excluded_driver_ids',
      (
        SELECT COALESCE(jsonb_agg(DISTINCT value), '[]'::jsonb)
        FROM (
          SELECT jsonb_array_elements_text(COALESCE(v_trip.wa_context->'dispatch_permanent_excluded_driver_ids', '[]'::jsonb)) AS value
          UNION
          SELECT v_driver_id::text
        ) ids
      )
    )
    WHERE id = p_trip_id;
  END IF;

  IF v_remaining = 0
     AND v_trip.status = 'pending'
     AND v_trip.driver_id IS NULL THEN
    UPDATE public.trips
    SET status = 'queued', dispatch_status = 'queued', assigned_at = NULL
    WHERE id = p_trip_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'remaining', v_remaining);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_dispatch_offer(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decline_dispatch_offer(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_dispatch_offer(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_dispatch_offer(UUID, TEXT) TO authenticated;

ALTER TABLE public.trip_dispatch_offers REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'trip_dispatch_offers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_dispatch_offers;
  END IF;
END $$;
