-- Cola de despacho para viajes WhatsApp en estado queued.
--
-- Objetivo:
-- 1) Evitar race conditions entre invocaciones paralelas del dispatcher.
-- 2) Mantener lock por viaje con expiracion y reintentos controlados.
-- 3) Seguir usando trips.status='queued' como fuente de verdad funcional,
--    pero con una tabla operativa dedicada para claim/release atomico.
--
-- Ejecutar manualmente en el SQL editor de Supabase.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.trip_dispatch_queue (
  trip_id UUID PRIMARY KEY REFERENCES public.trips(id) ON DELETE CASCADE,
  passenger_phone TEXT NOT NULL,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  queue_status TEXT NOT NULL DEFAULT 'queued' CHECK (queue_status IN ('queued', 'locked')),
  lock_token UUID,
  locked_by TEXT,
  locked_at TIMESTAMPTZ,
  lock_expires_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trip_dispatch_queue_ready
  ON public.trip_dispatch_queue (queue_status, next_attempt_at, queued_at);

CREATE INDEX IF NOT EXISTS idx_trip_dispatch_queue_phone
  ON public.trip_dispatch_queue (passenger_phone, queued_at);

CREATE OR REPLACE FUNCTION public.set_trip_dispatch_queue_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trip_dispatch_queue_updated_at ON public.trip_dispatch_queue;
CREATE TRIGGER trg_trip_dispatch_queue_updated_at
BEFORE UPDATE ON public.trip_dispatch_queue
FOR EACH ROW
EXECUTE FUNCTION public.set_trip_dispatch_queue_updated_at();

CREATE OR REPLACE FUNCTION public.sync_trip_dispatch_queue_from_trips()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.trip_dispatch_queue WHERE trip_id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.status = 'queued' THEN
    INSERT INTO public.trip_dispatch_queue (
      trip_id,
      passenger_phone,
      queued_at,
      next_attempt_at,
      queue_status,
      lock_token,
      locked_by,
      locked_at,
      lock_expires_at,
      last_error
    )
    VALUES (
      NEW.id,
      COALESCE(NEW.passenger_phone, ''),
      COALESCE(NEW.created_at, NOW()),
      NOW(),
      'queued',
      NULL,
      NULL,
      NULL,
      NULL,
      NULL
    )
    ON CONFLICT (trip_id) DO UPDATE
    SET
      passenger_phone = COALESCE(EXCLUDED.passenger_phone, public.trip_dispatch_queue.passenger_phone),
      queued_at = COALESCE(public.trip_dispatch_queue.queued_at, EXCLUDED.queued_at, NOW()),
      next_attempt_at = NOW(),
      queue_status = 'queued',
      lock_token = NULL,
      locked_by = NULL,
      locked_at = NULL,
      lock_expires_at = NULL,
      last_error = NULL,
      updated_at = NOW();

    RETURN NEW;
  END IF;

  DELETE FROM public.trip_dispatch_queue WHERE trip_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_trip_dispatch_queue_iu ON public.trips;
CREATE TRIGGER trg_sync_trip_dispatch_queue_iu
AFTER INSERT OR UPDATE OF status, passenger_phone, created_at
ON public.trips
FOR EACH ROW
EXECUTE FUNCTION public.sync_trip_dispatch_queue_from_trips();

DROP TRIGGER IF EXISTS trg_sync_trip_dispatch_queue_d ON public.trips;
CREATE TRIGGER trg_sync_trip_dispatch_queue_d
AFTER DELETE ON public.trips
FOR EACH ROW
EXECUTE FUNCTION public.sync_trip_dispatch_queue_from_trips();

-- Backfill inicial para viajes ya en cola.
INSERT INTO public.trip_dispatch_queue (
  trip_id,
  passenger_phone,
  queued_at,
  next_attempt_at,
  queue_status
)
SELECT
  t.id,
  COALESCE(t.passenger_phone, ''),
  COALESCE(t.created_at, NOW()),
  NOW(),
  'queued'
FROM public.trips t
WHERE t.status = 'queued'
ON CONFLICT (trip_id) DO UPDATE
SET
  passenger_phone = EXCLUDED.passenger_phone,
  queued_at = COALESCE(public.trip_dispatch_queue.queued_at, EXCLUDED.queued_at),
  next_attempt_at = NOW(),
  queue_status = 'queued',
  lock_token = NULL,
  locked_by = NULL,
  locked_at = NULL,
  lock_expires_at = NULL,
  last_error = NULL,
  updated_at = NOW();

CREATE OR REPLACE FUNCTION public.claim_trip_queue_item(
  p_trip_id UUID,
  p_worker TEXT DEFAULT NULL,
  p_lock_seconds INTEGER DEFAULT 25
)
RETURNS TABLE (
  claimed BOOLEAN,
  lock_token UUID,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_lock_seconds INTEGER := GREATEST(10, COALESCE(p_lock_seconds, 25));
  v_lock_token UUID;
BEGIN
  IF p_trip_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'missing_trip_id';
    RETURN;
  END IF;

  UPDATE public.trip_dispatch_queue
  SET
    queue_status = 'queued',
    lock_token = NULL,
    locked_by = NULL,
    locked_at = NULL,
    lock_expires_at = NULL,
    updated_at = v_now
  WHERE trip_id = p_trip_id
    AND queue_status = 'locked'
    AND lock_expires_at IS NOT NULL
    AND lock_expires_at <= v_now;

  UPDATE public.trip_dispatch_queue q
  SET
    queue_status = 'locked',
    lock_token = gen_random_uuid(),
    locked_by = COALESCE(NULLIF(p_worker, ''), 'worker'),
    locked_at = v_now,
    lock_expires_at = v_now + make_interval(secs => v_lock_seconds),
    attempt_count = q.attempt_count + 1,
    last_error = NULL,
    updated_at = v_now
  WHERE q.trip_id = p_trip_id
    AND q.queue_status = 'queued'
    AND q.next_attempt_at <= v_now
  RETURNING q.lock_token INTO v_lock_token;

  IF v_lock_token IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'not_available';
    RETURN;
  END IF;

  RETURN QUERY SELECT TRUE, v_lock_token, 'claimed';
END;
$$;

CREATE OR REPLACE FUNCTION public.release_trip_queue_item(
  p_trip_id UUID,
  p_lock_token UUID,
  p_result TEXT DEFAULT 'retry',
  p_retry_seconds INTEGER DEFAULT 12,
  p_error TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result TEXT := LOWER(COALESCE(p_result, 'retry'));
  v_retry_seconds INTEGER := GREATEST(1, COALESCE(p_retry_seconds, 12));
BEGIN
  IF p_trip_id IS NULL OR p_lock_token IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_result NOT IN ('retry', 'done', 'drop') THEN
    v_result := 'retry';
  END IF;

  IF v_result = 'retry' THEN
    UPDATE public.trip_dispatch_queue
    SET
      queue_status = 'queued',
      lock_token = NULL,
      locked_by = NULL,
      locked_at = NULL,
      lock_expires_at = NULL,
      next_attempt_at = NOW() + make_interval(secs => v_retry_seconds),
      last_error = NULLIF(p_error, ''),
      updated_at = NOW()
    WHERE trip_id = p_trip_id
      AND queue_status = 'locked'
      AND lock_token = p_lock_token;
    RETURN FOUND;
  END IF;

  DELETE FROM public.trip_dispatch_queue
  WHERE trip_id = p_trip_id
    AND queue_status = 'locked'
    AND lock_token = p_lock_token;
  RETURN FOUND;
END;
$$;

ALTER TABLE public.trip_dispatch_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage trip dispatch queue" ON public.trip_dispatch_queue;
CREATE POLICY "Service role can manage trip dispatch queue"
  ON public.trip_dispatch_queue
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

REVOKE ALL ON FUNCTION public.claim_trip_queue_item(UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_trip_queue_item(UUID, TEXT, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.release_trip_queue_item(UUID, UUID, TEXT, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_trip_queue_item(UUID, UUID, TEXT, INTEGER, TEXT) TO service_role;

COMMENT ON TABLE public.trip_dispatch_queue IS
'Cola operativa de viajes queued con lock por viaje para evitar carreras entre ejecuciones paralelas del dispatcher.';
