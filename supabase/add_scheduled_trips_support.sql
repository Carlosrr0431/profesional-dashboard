-- ─────────────────────────────────────────────────────────────────────────────
-- Soporte para viajes programados (scheduled trips)
-- Fecha: 2026-05-18
--
-- Cambios:
--   1. Agrega el estado 'scheduled' al constraint de trips.status
--   2. Agrega columna opcional scheduled_for (TIMESTAMPTZ) para consultas eficientes
--   3. Índice parcial sobre scheduled_for para trips 'scheduled'
--   4. RLS: permite al agente (service role) insertar/actualizar scheduled trips
--
-- Aplicar en: Editor SQL de Supabase
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Agregar 'scheduled' como valor permitido en trips.status
--    (ver también add_scheduled_status_to_trips.sql — mismo bloque, idempotente)
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

-- 2. Columna scheduled_for (opcional — el código usa notes como fuente primaria)
--    Permite consultas eficientes con índice sin parsear JSON/texto.
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;

COMMENT ON COLUMN trips.scheduled_for IS
  'Fecha/hora programada del viaje (UTC). Se usa solo cuando status = ''scheduled''. '
  'El agente también guarda [SCHEDULED_FOR] ISO en notes como respaldo.';

-- 3. Índice parcial para consultar rápido los viajes programados pendientes
CREATE INDEX IF NOT EXISTS idx_trips_scheduled_for
  ON trips (scheduled_for ASC)
  WHERE status = 'scheduled';

-- 4. Backfill: poblar scheduled_for en viajes scheduled ya existentes
--    (si los hubiera desde una versión anterior del código)
UPDATE trips
SET scheduled_for = (
  regexp_match(notes, '\[SCHEDULED_FOR\] (\S+)')
)[1]::TIMESTAMPTZ
WHERE status = 'scheduled'
  AND notes LIKE '%[SCHEDULED_FOR]%'
  AND scheduled_for IS NULL;
