-- Fix: al pasar un viaje a status='queued', el trigger sync_dispatch_queue_from_trips
-- forzaba next_attempt_at = NOW() y next_dispatch_at = NOW(), pisando el backoff
-- que el dispatch-worker / Agente_IA habían escrito en trips.next_dispatch_at.
-- Resultado: el mismo ciclo del worker re-claimaba el viaje al instante y el chofer
-- que aceptaba tarde veía "Tiempo agotado" (status ya no era pending con su driver_id).
--
-- Aplicar manualmente en el SQL Editor de Supabase.

CREATE OR REPLACE FUNCTION public.sync_dispatch_queue_from_trips()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_attempt TIMESTAMPTZ;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.dispatch_queue WHERE trip_id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.status = 'queued' AND NEW.dispatch_status IS DISTINCT FROM 'hold' THEN
    -- Respetar backoff explícito; solo usar NOW() si no hay next_dispatch_at futuro.
    v_next_attempt := COALESCE(NEW.next_dispatch_at, NOW());
    IF v_next_attempt < NOW() THEN
      v_next_attempt := NOW();
    END IF;

    INSERT INTO public.dispatch_queue (
      trip_id,
      passenger_phone,
      queue_status,
      enqueued_at,
      next_attempt_at,
      priority
    ) VALUES (
      NEW.id,
      COALESCE(NEW.passenger_phone, ''),
      'queued',
      COALESCE(NEW.created_at, NOW()),
      v_next_attempt,
      100
    )
    ON CONFLICT (trip_id) DO UPDATE
    SET
      passenger_phone = COALESCE(EXCLUDED.passenger_phone, public.dispatch_queue.passenger_phone),
      queue_status = 'queued',
      next_attempt_at = EXCLUDED.next_attempt_at,
      lock_token = NULL,
      lock_owner = NULL,
      lock_acquired_at = NULL,
      lock_expires_at = NULL,
      last_error_code = NULL,
      last_error = NULL,
      updated_at = NOW();

    UPDATE public.trips
    SET
      dispatch_status = 'queued',
      next_dispatch_at = COALESCE(NEW.next_dispatch_at, NOW())
    WHERE id = NEW.id;

    RETURN NEW;
  END IF;

  -- Hold: no encolar ni borrar de la cola.
  IF NEW.status = 'queued' AND NEW.dispatch_status = 'hold' THEN
    RETURN NEW;
  END IF;

  DELETE FROM public.dispatch_queue WHERE trip_id = NEW.id;

  IF NEW.status = 'pending' THEN
    UPDATE public.trips
    SET dispatch_status = 'waiting_acceptance', next_dispatch_at = NULL
    WHERE id = NEW.id;
  ELSIF NEW.status IN ('accepted', 'going_to_pickup', 'in_progress') THEN
    UPDATE public.trips
    SET dispatch_status = 'accepted', next_dispatch_at = NULL
    WHERE id = NEW.id;
  ELSIF NEW.status = 'cancelled' THEN
    UPDATE public.trips
    SET dispatch_status = 'cancelled', next_dispatch_at = NULL
    WHERE id = NEW.id;
  ELSIF NEW.status = 'completed' THEN
    UPDATE public.trips
    SET dispatch_status = 'completed', next_dispatch_at = NULL
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;
