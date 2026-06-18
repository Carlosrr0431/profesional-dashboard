-- Agregar valor 'hold' al enum dispatch_status_enum.
-- Se usa para trips placeholder que esperan una selección de dirección (poll)
-- o confirmación de precio antes de ser despachados.
-- Sin este valor, los inserts con dispatch_status='hold' fallan y el flujo
-- de poll de dirección se corrompe (trip no se crea, candidatos se pierden,
-- y el viaje termina con origin=destination incorrecto).

ALTER TYPE public.dispatch_status_enum ADD VALUE IF NOT EXISTS 'hold';

-- Actualizar el trigger para que NO encole trips con dispatch_status='hold'.
-- Estos trips están esperando input del pasajero y no deben ser despachados.
CREATE OR REPLACE FUNCTION public.sync_dispatch_queue_from_trips()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.dispatch_queue WHERE trip_id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.status = 'queued' AND NEW.dispatch_status IS DISTINCT FROM 'hold' THEN
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
      NOW(),
      100
    )
    ON CONFLICT (trip_id) DO UPDATE
    SET
      passenger_phone = COALESCE(EXCLUDED.passenger_phone, public.dispatch_queue.passenger_phone),
      queue_status = 'queued',
      next_attempt_at = NOW(),
      lock_token = NULL,
      lock_owner = NULL,
      lock_acquired_at = NULL,
      lock_expires_at = NULL,
      last_error_code = NULL,
      last_error = NULL,
      updated_at = NOW();

    UPDATE public.trips
    SET dispatch_status = 'queued', next_dispatch_at = NOW()
    WHERE id = NEW.id;

    RETURN NEW;
  END IF;

  -- Si es hold, no enqueue pero tampoco borrar de dispatch_queue si estaba
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
