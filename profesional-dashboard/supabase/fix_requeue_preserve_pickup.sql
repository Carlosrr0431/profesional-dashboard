-- Preserva el punto de retiro al reencolar pending → queued.
-- El dispatch worker usa destination_lat/lng; viajes legacy del dashboard lo tenían en origin_*.
-- Ejecutar en el editor SQL de Supabase.

CREATE OR REPLACE FUNCTION public.driver_reject_pending_trip(
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
  v_trip public.trips%ROWTYPE;
  v_context JSONB;
  v_excluded JSONB;
  v_is_timeout BOOLEAN;
  v_reason TEXT;
  v_dest_address TEXT;
  v_dest_lat DECIMAL(10, 8);
  v_dest_lng DECIMAL(11, 8);
BEGIN
  v_driver_id := public.get_my_driver_id();
  IF v_driver_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'driver_not_found');
  END IF;

  v_reason := COALESCE(NULLIF(trim(p_reason), ''), 'Rechazado por chofer');
  v_is_timeout := v_reason = 'Tiempo agotado';

  SELECT * INTO v_trip
  FROM public.trips
  WHERE id = p_trip_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'trip_not_found');
  END IF;

  IF v_trip.driver_id IS DISTINCT FROM v_driver_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'trip_not_owned');
  END IF;

  IF v_trip.status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'trip_not_pending', 'unavailable', true);
  END IF;

  v_context := COALESCE(v_trip.wa_context, '{}'::jsonb);
  v_excluded := COALESCE(v_context->'dispatch_excluded_driver_ids', '[]'::jsonb);

  IF NOT v_excluded @> to_jsonb(v_driver_id::text) THEN
    v_context := v_context || jsonb_build_object(
      'dispatch_excluded_driver_ids', v_excluded || to_jsonb(v_driver_id::text),
      'dispatch_last_excluded_at', to_jsonb(to_char(NOW() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
      'dispatch_last_excluded_reason', CASE WHEN v_is_timeout THEN 'driver_timeout' ELSE 'driver_rejected' END
    );
  END IF;

  v_dest_address := v_trip.destination_address;
  v_dest_lat := v_trip.destination_lat;
  v_dest_lng := v_trip.destination_lng;

  IF (v_dest_lat IS NULL OR v_dest_lng IS NULL)
     AND v_trip.origin_lat IS NOT NULL
     AND v_trip.origin_lng IS NOT NULL THEN
    v_dest_lat := v_trip.origin_lat;
    v_dest_lng := v_trip.origin_lng;
    v_dest_address := COALESCE(NULLIF(trim(v_trip.origin_address), ''), v_dest_address);
  END IF;

  UPDATE public.trips
  SET
    status = 'queued',
    driver_id = NULL,
    assigned_at = NULL,
    accepted_at = NULL,
    origin_address = NULL,
    origin_lat = NULL,
    origin_lng = NULL,
    destination_address = COALESCE(NULLIF(trim(v_dest_address), ''), destination_address),
    destination_lat = v_dest_lat,
    destination_lng = v_dest_lng,
    dispatch_status = 'queued',
    next_dispatch_at = NOW(),
    status_updated_at = NOW(),
    wa_context = v_context,
    cancel_reason = CASE WHEN v_is_timeout THEN 'Tiempo agotado' ELSE v_reason END
  WHERE id = p_trip_id
    AND driver_id = v_driver_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'trip_not_pending', 'unavailable', true);
  END IF;

  RETURN jsonb_build_object('success', true, 'trip_id', p_trip_id);
END;
$$;
