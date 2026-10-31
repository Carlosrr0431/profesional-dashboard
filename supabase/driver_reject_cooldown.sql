-- Si el chofer cancela con motivo, ese viaje no vuelve a ofrecérsele durante 1 minuto.
-- En ese minuto el dispatch puede mostrarle otro viaje de la misma zona.
-- Pegar una vez en el editor SQL de Supabase.

CREATE OR REPLACE FUNCTION public.request_dispatch_worker_wake()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url TEXT;
  v_secret TEXT;
  v_headers JSONB := '{}'::jsonb;
BEGIN
  SELECT value INTO v_url FROM public.settings WHERE key = 'dispatch_worker_url' LIMIT 1;
  SELECT value INTO v_secret FROM public.settings WHERE key = 'dispatch_worker_secret' LIMIT 1;
  IF v_url IS NULL OR btrim(v_url) = '' THEN
    RETURN;
  END IF;

  v_headers := jsonb_build_object('Content-Type', 'application/json');
  IF v_secret IS NOT NULL AND btrim(v_secret) <> '' THEN
    v_headers := v_headers || jsonb_build_object(
      'Authorization', 'Bearer ' || btrim(v_secret),
      'x-cron-secret', btrim(v_secret)
    );
  END IF;

  PERFORM net.http_get(btrim(v_url), '{}'::jsonb, v_headers, 8000);
EXCEPTION WHEN OTHERS THEN
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.request_dispatch_worker_wake() FROM PUBLIC;

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
    IF COALESCE(NULLIF(trim(p_reason), ''), 'Rechazado por chofer') = 'Tiempo agotado' THEN
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
    ELSE
      UPDATE public.trips
      SET wa_context = COALESCE(wa_context, '{}'::jsonb) || jsonb_build_object(
        'dispatch_driver_reject_cooldown_until',
        COALESCE(wa_context->'dispatch_driver_reject_cooldown_until', '{}'::jsonb)
          || jsonb_build_object(
            v_driver_id::text,
            to_char((NOW() + interval '60 seconds') AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          ),
        'dispatch_last_excluded_at', to_char(NOW() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'dispatch_last_excluded_reason', 'driver_rejected'
      )
      WHERE id = p_trip_id;
    END IF;
  END IF;

  IF v_remaining = 0
     AND v_trip.status = 'pending'
     AND v_trip.driver_id IS NULL THEN
    UPDATE public.trips
    SET status = 'queued', dispatch_status = 'queued', assigned_at = NULL
    WHERE id = p_trip_id;
  END IF;

  PERFORM public.request_dispatch_worker_wake();

  RETURN jsonb_build_object('success', true, 'remaining', v_remaining);
END;
$$;

REVOKE ALL ON FUNCTION public.decline_dispatch_offer(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decline_dispatch_offer(UUID, TEXT) TO authenticated;

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
  v_driver_id_text TEXT;
  v_trip public.trips%ROWTYPE;
  v_context JSONB;
  v_permanent JSONB;
  v_round JSONB;
  v_offer_counts JSONB;
  v_cooldown JSONB;
  v_next_offer_count INTEGER;
  v_all_excluded JSONB;
  v_is_timeout BOOLEAN;
  v_reason TEXT;
  v_now_iso TEXT;
  v_until_iso TEXT;
BEGIN
  v_driver_id := public.get_my_driver_id();
  IF v_driver_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'driver_not_found');
  END IF;

  v_driver_id_text := v_driver_id::text;
  v_reason := COALESCE(NULLIF(trim(p_reason), ''), 'Rechazado por chofer');
  v_is_timeout := v_reason = 'Tiempo agotado';
  v_now_iso := to_char(NOW() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_until_iso := to_char((NOW() + interval '60 seconds') AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  SELECT * INTO v_trip
  FROM public.trips
  WHERE id = p_trip_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'trip_not_found');
  END IF;

  v_context := COALESCE(v_trip.wa_context, '{}'::jsonb);

  IF v_trip.status = 'queued' AND v_trip.driver_id IS NULL THEN
    IF v_context->'dispatch_excluded_driver_ids' @> to_jsonb(v_driver_id_text)
       OR COALESCE(v_context->'dispatch_driver_reject_cooldown_until'->>v_driver_id_text, '') > v_now_iso THEN
      RETURN jsonb_build_object('success', true, 'trip_id', p_trip_id, 'idempotent', true);
    END IF;
  END IF;

  IF v_trip.driver_id IS DISTINCT FROM v_driver_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'trip_not_owned');
  END IF;

  IF v_trip.status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'trip_not_pending', 'unavailable', true);
  END IF;

  v_permanent := COALESCE(v_context->'dispatch_permanent_excluded_driver_ids',
                           v_context->'dispatch_excluded_driver_ids',
                           '[]'::jsonb);
  v_round := COALESCE(v_context->'dispatch_round_excluded_driver_ids', '[]'::jsonb);
  v_offer_counts := COALESCE(v_context->'dispatch_driver_offer_counts', '{}'::jsonb);
  v_cooldown := CASE
    WHEN jsonb_typeof(v_context->'dispatch_driver_reject_cooldown_until') = 'object'
    THEN v_context->'dispatch_driver_reject_cooldown_until'
    ELSE '{}'::jsonb
  END;

  IF jsonb_typeof(v_permanent) IS DISTINCT FROM 'array' THEN
    v_permanent := '[]'::jsonb;
  END IF;
  IF jsonb_typeof(v_round) IS DISTINCT FROM 'array' THEN
    v_round := '[]'::jsonb;
  END IF;
  IF jsonb_typeof(v_offer_counts) IS DISTINCT FROM 'object' THEN
    v_offer_counts := '{}'::jsonb;
  END IF;

  IF v_permanent @> to_jsonb(v_driver_id_text) THEN
    NULL;
  ELSIF v_is_timeout THEN
    v_next_offer_count := COALESCE((v_offer_counts->>v_driver_id_text)::integer, 0) + 1;
    v_offer_counts := jsonb_set(v_offer_counts, ARRAY[v_driver_id_text], to_jsonb(v_next_offer_count));
    v_round := (SELECT jsonb_agg(elem) FROM jsonb_array_elements(v_round) elem WHERE elem #>> '{}' != v_driver_id_text);
    v_permanent := (SELECT jsonb_agg(elem) FROM jsonb_array_elements(v_permanent) elem WHERE elem #>> '{}' != v_driver_id_text);
    v_round := COALESCE(v_round, '[]'::jsonb);
    v_permanent := COALESCE(v_permanent, '[]'::jsonb);
    IF v_next_offer_count >= 3 THEN
      v_permanent := v_permanent || to_jsonb(v_driver_id_text);
    ELSE
      v_round := v_round || to_jsonb(v_driver_id_text);
    END IF;
  ELSE
    v_round := (SELECT jsonb_agg(elem) FROM jsonb_array_elements(v_round) elem WHERE elem #>> '{}' != v_driver_id_text);
    v_round := COALESCE(v_round, '[]'::jsonb);
    v_cooldown := v_cooldown || jsonb_build_object(v_driver_id_text, v_until_iso);
  END IF;

  v_all_excluded := (
    SELECT COALESCE(jsonb_agg(DISTINCT elem), '[]'::jsonb)
    FROM (
      SELECT elem FROM jsonb_array_elements(v_permanent) elem
      UNION ALL
      SELECT elem FROM jsonb_array_elements(v_round) elem
    ) sub
  );

  v_context := v_context
    || jsonb_build_object(
         'dispatch_excluded_driver_ids',           v_all_excluded,
         'dispatch_permanent_excluded_driver_ids',  v_permanent,
         'dispatch_round_excluded_driver_ids',      v_round,
         'dispatch_driver_offer_counts',            v_offer_counts,
         'dispatch_driver_reject_cooldown_until',   v_cooldown,
         'dispatch_last_excluded_at',               v_now_iso,
         'dispatch_last_excluded_reason',           CASE WHEN v_is_timeout THEN 'driver_timeout' ELSE 'driver_rejected' END
       );

  UPDATE public.trips
  SET
    status = 'queued',
    driver_id = NULL,
    assigned_at = NULL,
    accepted_at = NULL,
    origin_address = CASE
      WHEN COALESCE(v_trip.notes, '') LIKE '%[APPROACH_ONLY]%'
        OR COALESCE(v_trip.notes, '') LIKE '%[PASSENGER_APP]%'
      THEN v_trip.origin_address
      ELSE NULL
    END,
    origin_lat = CASE
      WHEN COALESCE(v_trip.notes, '') LIKE '%[APPROACH_ONLY]%'
        OR COALESCE(v_trip.notes, '') LIKE '%[PASSENGER_APP]%'
      THEN v_trip.origin_lat
      ELSE NULL
    END,
    origin_lng = CASE
      WHEN COALESCE(v_trip.notes, '') LIKE '%[APPROACH_ONLY]%'
        OR COALESCE(v_trip.notes, '') LIKE '%[PASSENGER_APP]%'
      THEN v_trip.origin_lng
      ELSE NULL
    END,
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

  UPDATE public.trip_dispatch_offers
  SET status = 'rejected', resolved_at = NOW()
  WHERE trip_id = p_trip_id
    AND driver_id = v_driver_id
    AND status = 'pending';

  PERFORM public.request_dispatch_worker_wake();

  RETURN jsonb_build_object('success', true, 'trip_id', p_trip_id);
END;
$$;

REVOKE ALL ON FUNCTION public.driver_reject_pending_trip(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.driver_reject_pending_trip(UUID, TEXT) TO authenticated;
