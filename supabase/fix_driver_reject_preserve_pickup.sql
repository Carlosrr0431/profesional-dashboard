-- Preserva origin_* al reencolar viajes WhatsApp [APPROACH_ONLY] y passenger-app [PASSENGER_APP]
-- cuando el chofer rechaza o vence el timeout de aceptación.
--
-- EJECUTAR en el editor SQL de Supabase (misma función que fix_trips_rls_driver_reject.sql).

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
  v_next_offer_count INTEGER;
  v_all_excluded JSONB;
  v_is_timeout BOOLEAN;
  v_reason TEXT;
  v_now_iso TEXT;
BEGIN
  v_driver_id := public.get_my_driver_id();
  IF v_driver_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'driver_not_found');
  END IF;

  v_driver_id_text := v_driver_id::text;
  v_reason := COALESCE(NULLIF(trim(p_reason), ''), 'Rechazado por chofer');
  v_is_timeout := v_reason = 'Tiempo agotado';
  v_now_iso := to_char(NOW() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  SELECT * INTO v_trip
  FROM public.trips
  WHERE id = p_trip_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'trip_not_found');
  END IF;

  v_context := COALESCE(v_trip.wa_context, '{}'::jsonb);

  -- Chequeo idempotencia: ya reencolado y excluido
  IF v_trip.status = 'queued' AND v_trip.driver_id IS NULL THEN
    IF v_context->'dispatch_excluded_driver_ids' @> to_jsonb(v_driver_id_text) THEN
      RETURN jsonb_build_object('success', true, 'trip_id', p_trip_id, 'idempotent', true);
    END IF;
  END IF;

  IF v_trip.driver_id IS DISTINCT FROM v_driver_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'trip_not_owned');
  END IF;

  IF v_trip.status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'trip_not_pending', 'unavailable', true);
  END IF;

  -- Construir exclusión en formato nuevo (compatible con canResetTimeoutRoundExclusions)
  v_permanent := COALESCE(v_context->'dispatch_permanent_excluded_driver_ids',
                           v_context->'dispatch_excluded_driver_ids',
                           '[]'::jsonb);
  v_round := COALESCE(v_context->'dispatch_round_excluded_driver_ids', '[]'::jsonb);
  v_offer_counts := COALESCE(v_context->'dispatch_driver_offer_counts', '{}'::jsonb);

  -- Si ya está en permanentes no hacer nada al contexto
  IF v_permanent @> to_jsonb(v_driver_id_text) THEN
    NULL; -- contexto sin cambios
  ELSIF v_is_timeout THEN
    -- Timeout: va a round_excluded hasta MAX_DRIVER_OFFER_ATTEMPTS (3), luego a permanente
    v_next_offer_count := COALESCE((v_offer_counts->>v_driver_id_text)::integer, 0) + 1;
    v_offer_counts := jsonb_set(v_offer_counts, ARRAY[v_driver_id_text], to_jsonb(v_next_offer_count));
    -- Quitar de round y permanent para reposicionarlo
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
    -- Rechazo explícito: permanente de inmediato
    v_round := (SELECT jsonb_agg(elem) FROM jsonb_array_elements(v_round) elem WHERE elem #>> '{}' != v_driver_id_text);
    v_round := COALESCE(v_round, '[]'::jsonb);
    IF NOT (v_permanent @> to_jsonb(v_driver_id_text)) THEN
      v_permanent := v_permanent || to_jsonb(v_driver_id_text);
    END IF;
  END IF;

  -- all_excluded = union de permanent + round
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

  RETURN jsonb_build_object('success', true, 'trip_id', p_trip_id);
END;
$$;

REVOKE ALL ON FUNCTION public.driver_reject_pending_trip(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.driver_reject_pending_trip(UUID, TEXT) TO authenticated;
