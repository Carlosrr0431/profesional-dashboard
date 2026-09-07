-- =============================================================================
-- Franjas por calendario: todos los días, días recurrentes o un día específico.
-- Ejecutar manualmente en el editor SQL de Supabase DESPUÉS de tariff_windows.sql.
--
-- schedule_kind:
--   always    → todos los días del año (comportamiento actual)
--   weekdays  → se repite ciertos días (1=lunes … 7=domingo)
--   date      → un día puntual (feriado / especial)
--
-- Prioridad al resolver el precio:
--   1) date  2) weekdays  3) always
-- Si la franja cruza medianoche, el tramo de la madrugada pertenece al día
-- en el que empezó (ej. sábado 22:00–06:00 vale hasta el domingo 06:00).
-- Las franjas ya creadas quedan como "always": no cambia nada hasta que
-- edites o agregues una nueva.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'tariff_windows'
  ) THEN
    RAISE EXCEPTION 'Falta crear public.tariff_windows. Ejecutá supabase/tariff_windows.sql primero.';
  END IF;
END $$;

BEGIN;

ALTER TABLE public.tariff_windows
  ADD COLUMN IF NOT EXISTS schedule_kind text NOT NULL DEFAULT 'always';

ALTER TABLE public.tariff_windows
  ADD COLUMN IF NOT EXISTS weekdays integer[] NOT NULL DEFAULT '{}';

ALTER TABLE public.tariff_windows
  ADD COLUMN IF NOT EXISTS specific_date date;

ALTER TABLE public.tariff_windows
  ADD COLUMN IF NOT EXISTS label text;

UPDATE public.tariff_windows
SET
  schedule_kind = COALESCE(NULLIF(schedule_kind, ''), 'always'),
  weekdays = COALESCE(weekdays, '{}'),
  specific_date = CASE
    WHEN COALESCE(NULLIF(schedule_kind, ''), 'always') = 'date' THEN specific_date
    ELSE NULL
  END
WHERE true;

ALTER TABLE public.tariff_windows DROP CONSTRAINT IF EXISTS tariff_windows_schedule_kind_chk;
ALTER TABLE public.tariff_windows
  ADD CONSTRAINT tariff_windows_schedule_kind_chk
  CHECK (schedule_kind IN ('always', 'weekdays', 'date'));

ALTER TABLE public.tariff_windows DROP CONSTRAINT IF EXISTS tariff_windows_schedule_shape_chk;
ALTER TABLE public.tariff_windows
  ADD CONSTRAINT tariff_windows_schedule_shape_chk
  CHECK (
    (
      schedule_kind = 'always'
      AND COALESCE(cardinality(weekdays), 0) = 0
      AND specific_date IS NULL
    )
    OR (
      schedule_kind = 'weekdays'
      AND cardinality(weekdays) >= 1
      AND weekdays <@ ARRAY[1, 2, 3, 4, 5, 6, 7]
      AND specific_date IS NULL
    )
    OR (
      schedule_kind = 'date'
      AND specific_date IS NOT NULL
      AND COALESCE(cardinality(weekdays), 0) = 0
    )
  );

CREATE INDEX IF NOT EXISTS idx_tariff_windows_schedule
  ON public.tariff_windows (channel, enabled, schedule_kind, specific_date);

COMMIT;
