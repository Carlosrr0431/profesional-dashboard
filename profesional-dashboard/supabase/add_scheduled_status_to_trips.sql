-- Agrega el status 'scheduled' al check constraint de trips.
--
-- Sin este valor, los viajes programados por WhatsApp fallan al insertar con:
--   23514 trips_status_check
--
-- EJECUTAR en el editor SQL de Supabase (después de add_queued_status_to_trips.sql).

ALTER TABLE trips
  DROP CONSTRAINT IF EXISTS trips_status_check;

ALTER TABLE trips
  ADD CONSTRAINT trips_status_check
    CHECK (status IN (
      'scheduled',
      'queued',
      'pending',
      'accepted',
      'going_to_pickup',
      'in_progress',
      'completed',
      'cancelled'
    ));
