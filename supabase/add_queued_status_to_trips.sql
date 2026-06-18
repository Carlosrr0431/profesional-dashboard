-- Agrega el status 'queued' al check constraint de trips.
--
-- 'queued' representa viajes creados desde WhatsApp que esperan
-- en cola hasta que dispatchQueuedPassengers les asigne un chofer.
-- Sin este status en el constraint, el INSERT falla con error 23514.
--
-- EJECUTAR en el editor SQL de Supabase antes de deployar.

ALTER TABLE trips
  DROP CONSTRAINT IF EXISTS trips_status_check;

ALTER TABLE trips
  ADD CONSTRAINT trips_status_check
    CHECK (status IN (
      'queued',
      'pending',
      'accepted',
      'going_to_pickup',
      'in_progress',
      'completed',
      'cancelled'
    ));
