-- Demanda del panel. Misma cuenta que ven los choferes, calculada en la base
-- para no bajar semanas de viajes al servidor.
-- Pegar una vez en el editor SQL de Supabase.

CREATE OR REPLACE FUNCTION public.operator_demand_forecast()
RETURNS TABLE (
  lat double precision,
  lng double precision,
  created_at timestamptz,
  kind text,
  pickup_address text,
  destination_address text,
  note text,
  trip_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  local_now timestamp;
  day_start timestamptz;
  shift_start timestamptz;
  minute_now integer;
  dow_now integer;
BEGIN
  local_now := timezone('America/Argentina/Salta', now());
  day_start := date_trunc('day', local_now) AT TIME ZONE 'America/Argentina/Salta';
  -- De 00:00 a 05:59 sigue el turno que empezó ayer a las 22.
  shift_start := (
    date_trunc('day', local_now)
    + make_interval(hours => CASE
      WHEN EXTRACT(HOUR FROM local_now) >= 22 THEN 22
      WHEN EXTRACT(HOUR FROM local_now) >= 14 THEN 14
      WHEN EXTRACT(HOUR FROM local_now) >= 6 THEN 6
      ELSE -2
    END)
  ) AT TIME ZONE 'America/Argentina/Salta';
  minute_now :=
    EXTRACT(HOUR FROM local_now)::integer * 60
    + EXTRACT(MINUTE FROM local_now)::integer;
  dow_now := EXTRACT(DOW FROM local_now)::integer;

  RETURN QUERY
  WITH raw AS (
    SELECT
      t.created_at,
      COALESCE(t.notes, '') AS notes,
      t.status IN ('in_progress', 'completed') AS boarded,
      (
        COALESCE(t.notes, '') ILIKE '%[APPROACH_ONLY]%'
        OR COALESCE(t.notes, '') ILIKE '%creado automaticamente desde whatsapp%'
      ) AS approach,
      COALESCE(t.notes, '') ILIKE '%[STREET_HAIL]%' AS street_hail,
      COALESCE(t.notes, '') ILIKE '%[FINAL_DEST_JSON:%' AS has_final,
      CASE
        WHEN t.origin_lat::text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN t.origin_lat::double precision
      END AS origin_lat,
      CASE
        WHEN t.origin_lng::text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN t.origin_lng::double precision
      END AS origin_lng,
      CASE
        WHEN t.destination_lat::text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN t.destination_lat::double precision
      END AS dest_lat,
      CASE
        WHEN t.destination_lng::text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN t.destination_lng::double precision
      END AS dest_lng,
      NULLIF(
        substring(
          substring(COALESCE(t.notes, '') FROM '\[PICKUP_JSON:\{[^}]*')
          FROM '"lat"\s*:\s*(-?[0-9.]+)'
        ),
        ''
      )::double precision AS pickup_lat,
      NULLIF(
        substring(
          substring(COALESCE(t.notes, '') FROM '\[PICKUP_JSON:\{[^}]*')
          FROM '"lng"\s*:\s*(-?[0-9.]+)'
        ),
        ''
      )::double precision AS pickup_lng,
      (
        EXTRACT(HOUR FROM timezone('America/Argentina/Salta', t.created_at))::integer * 60
        + EXTRACT(MINUTE FROM timezone('America/Argentina/Salta', t.created_at))::integer
      ) AS minute_of,
      EXTRACT(DOW FROM timezone('America/Argentina/Salta', t.created_at))::integer AS dow_of,
      t.created_at >= shift_start AS in_shift
    FROM public.trips t
    WHERE t.driver_id IS NOT NULL
      AND t.status IN ('accepted', 'going_to_pickup', 'in_progress', 'completed')
      AND t.created_at >= day_start - interval '4 weeks'
      AND t.created_at < day_start + interval '1 day'
  ),
  located AS (
    SELECT
      r.created_at,
      r.in_shift,
      CASE
        WHEN r.pickup_lat IS NOT NULL AND r.pickup_lng IS NOT NULL THEN r.pickup_lat
        WHEN r.street_hail AND r.origin_lat IS NOT NULL THEN r.origin_lat
        WHEN r.approach AND r.boarded AND r.origin_lat IS NOT NULL THEN r.origin_lat
        WHEN r.dest_lat IS NOT NULL AND (r.approach OR NOT r.has_final) THEN r.dest_lat
        ELSE r.origin_lat
      END AS lat,
      CASE
        WHEN r.pickup_lat IS NOT NULL AND r.pickup_lng IS NOT NULL THEN r.pickup_lng
        WHEN r.street_hail AND r.origin_lng IS NOT NULL THEN r.origin_lng
        WHEN r.approach AND r.boarded AND r.origin_lng IS NOT NULL THEN r.origin_lng
        WHEN r.dest_lng IS NOT NULL AND (r.approach OR NOT r.has_final) THEN r.dest_lng
        ELSE r.origin_lng
      END AS lng,
      LEAST(ABS(r.minute_of - minute_now), 1440 - ABS(r.minute_of - minute_now)) <= 60 AS in_hour,
      r.dow_of = dow_now AS same_weekday
    FROM raw r
  )
  SELECT
    avg(s.lat),
    avg(s.lng),
    max(s.created_at),
    'today'::text,
    NULL::text,
    NULL::text,
    NULL::text,
    count(*)::integer
  FROM located s
  WHERE s.in_shift
    AND s.lat BETWEEN -26.8 AND -21.8
    AND s.lng BETWEEN -68.6 AND -62.4
  GROUP BY round(s.lat::numeric / 0.008::numeric), round(s.lng::numeric / 0.008::numeric), s.in_hour

  UNION ALL

  SELECT
    avg(s.lat),
    avg(s.lng),
    max(s.created_at),
    'history'::text,
    NULL::text,
    NULL::text,
    NULL::text,
    count(*)::integer
  FROM located s
  WHERE NOT s.in_shift
    AND s.in_hour
    AND s.same_weekday
    AND s.lat BETWEEN -26.8 AND -21.8
    AND s.lng BETWEEN -68.6 AND -62.4
  GROUP BY round(s.lat::numeric / 0.008::numeric), round(s.lng::numeric / 0.008::numeric);

  RETURN QUERY
  SELECT
    p.lat,
    p.lng,
    p.scheduled_for,
    'scheduled'::text,
    p.pickup_address,
    p.destination_address,
    p.note,
    1
  FROM (
    SELECT
      COALESCE(
        t.scheduled_for,
        NULLIF(
          substring(COALESCE(t.notes, '') FROM '\[SCHEDULED_FOR\]\s*([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+(?:Z|[+-][0-9:]{2,5})?)'),
          ''
        )::timestamptz
      ) AS scheduled_for,
      NULLIF(btrim(t.origin_address), '') AS pickup_address,
      NULLIF(btrim(t.destination_address), '') AS destination_address,
      NULLIF(btrim(t.notes), '') AS note,
      CASE
        WHEN t.origin_lat::text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN t.origin_lat::double precision
        ELSE NULLIF(substring(substring(COALESCE(t.notes, '') FROM '\[PICKUP_JSON:\{[^}]*') FROM '"lat"\s*:\s*(-?[0-9.]+)'), '')::double precision
      END AS lat,
      CASE
        WHEN t.origin_lng::text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN t.origin_lng::double precision
        ELSE NULLIF(substring(substring(COALESCE(t.notes, '') FROM '\[PICKUP_JSON:\{[^}]*') FROM '"lng"\s*:\s*(-?[0-9.]+)'), '')::double precision
      END AS lng
    FROM public.trips t
    WHERE t.status IN ('scheduled', 'queued', 'pending')
      AND (
        t.scheduled_for IS NOT NULL
        OR COALESCE(t.notes, '') ~ '\[SCHEDULED_FOR\]'
      )
      AND (
        COALESCE(t.notes, '') ILIKE '%[SCHEDULED_SOURCE] passenger_app%'
        OR COALESCE(t.notes, '') ILIKE '%[SCHEDULED_SOURCE] passenger_web%'
        OR COALESCE(t.notes, '') ILIKE '%[SCHEDULED_SOURCE] dashboard%'
        OR COALESCE(t.notes, '') ~* '\[DASHBOARD\]'
        OR (
          COALESCE(t.notes, '') ILIKE '%[PASSENGER_APP]%'
          AND COALESCE(t.notes, '') NOT ILIKE '%[SCHEDULED_SOURCE] whatsapp%'
        )
      )
  ) p
  WHERE p.scheduled_for >= timezone('utc', now()) - interval '12 hours'
    AND p.scheduled_for < timezone('utc', now()) + interval '21 days'
    AND p.lat BETWEEN -26.8 AND -21.8
    AND p.lng BETWEEN -68.6 AND -62.4
  ORDER BY p.scheduled_for ASC
  LIMIT 40;

  RETURN QUERY
  SELECT
    q.lat,
    q.lng,
    q.created_at,
    'queued'::text,
    NULL::text,
    NULL::text,
    NULL::text,
    1
  FROM (
    SELECT
      t.created_at,
      CASE
        WHEN t.origin_lat::text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN t.origin_lat::double precision
        WHEN t.destination_lat::text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN t.destination_lat::double precision
        ELSE NULLIF(substring(substring(COALESCE(t.notes, '') FROM '\[PICKUP_JSON:\{[^}]*') FROM '"lat"\s*:\s*(-?[0-9.]+)'), '')::double precision
      END AS lat,
      CASE
        WHEN t.origin_lng::text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN t.origin_lng::double precision
        WHEN t.destination_lng::text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN t.destination_lng::double precision
        ELSE NULLIF(substring(substring(COALESCE(t.notes, '') FROM '\[PICKUP_JSON:\{[^}]*') FROM '"lng"\s*:\s*(-?[0-9.]+)'), '')::double precision
      END AS lng
    FROM public.trips t
    WHERE t.scheduled_for IS NULL
      AND COALESCE(t.notes, '') !~ '\[SCHEDULED_FOR\]'
      AND t.status IN ('queued', 'pending')
      AND t.created_at >= timezone('utc', now()) - interval '12 hours'
  ) q
  WHERE q.lat BETWEEN -26.8 AND -21.8
    AND q.lng BETWEEN -68.6 AND -62.4
  ORDER BY q.created_at DESC
  LIMIT 40;
END;
$$;

REVOKE ALL ON FUNCTION public.operator_demand_forecast() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_demand_forecast() TO service_role;

CREATE INDEX IF NOT EXISTS trips_demand_fleet_created_idx
  ON public.trips (created_at DESC)
  WHERE driver_id IS NOT NULL
    AND status IN ('accepted', 'going_to_pickup', 'in_progress', 'completed');

CREATE INDEX IF NOT EXISTS trips_demand_queue_created_idx
  ON public.trips (created_at DESC)
  WHERE scheduled_for IS NULL
    AND status IN ('queued', 'pending');

CREATE INDEX IF NOT EXISTS trips_demand_scheduled_at_idx
  ON public.trips (scheduled_for)
  WHERE status IN ('scheduled', 'queued', 'pending')
    AND scheduled_for IS NOT NULL;
