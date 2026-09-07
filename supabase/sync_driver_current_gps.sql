-- GPS del mapa: current_lat / current_lng en public.drivers + Realtime.
-- Ejecutar TODO este archivo en el SQL Editor de Supabase.
--
-- La app del chofer ya escribe current_lat/lng. Este SQL:
-- 1) copia a drivers cualquier upsert de driver_locations (por si algún
--    camino no actualiza current_lat);
-- 2) toca updated_at cuando cambian las coords;
-- 3) publica drivers en supabase_realtime.

-- ══════════════════════════════════════════════════
-- 1. Si driver_locations se actualiza, copiar a drivers
--    (no pisa con 0,0 ni con coords inválidas)
-- ══════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.sync_driver_current_gps_from_locations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.driver_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.lat IS NULL OR NEW.lng IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.lat = 0 AND NEW.lng = 0 THEN
    RETURN NEW;
  END IF;
  IF NEW.lat < -90 OR NEW.lat > 90 OR NEW.lng < -180 OR NEW.lng > 180 THEN
    RETURN NEW;
  END IF;

  UPDATE public.drivers
  SET
    current_lat = NEW.lat,
    current_lng = NEW.lng,
    updated_at = NOW()
  WHERE id = NEW.driver_id
    AND (
      current_lat IS DISTINCT FROM NEW.lat
      OR current_lng IS DISTINCT FROM NEW.lng
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_driver_current_gps ON public.driver_locations;
CREATE TRIGGER trg_sync_driver_current_gps
  AFTER INSERT OR UPDATE OF lat, lng
  ON public.driver_locations
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_driver_current_gps_from_locations();

-- ══════════════════════════════════════════════════
-- 2. Si current_lat/lng cambian y updated_at no, tocarlo
--    (el dashboard usa updated_at para no pisar Realtime)
-- ══════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.touch_driver_gps_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.current_lat IS DISTINCT FROM OLD.current_lat
     OR NEW.current_lng IS DISTINCT FROM OLD.current_lng THEN
    IF NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at THEN
      NEW.updated_at := NOW();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_driver_gps_updated_at ON public.drivers;
CREATE TRIGGER trg_touch_driver_gps_updated_at
  BEFORE UPDATE OF current_lat, current_lng
  ON public.drivers
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_driver_gps_updated_at();

-- ══════════════════════════════════════════════════
-- 3. Realtime: el dashboard se suscribe a public.drivers
-- ══════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'drivers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.drivers;
  END IF;
END $$;

ALTER TABLE public.drivers REPLICA IDENTITY DEFAULT;

-- Verificación:
-- SELECT tablename
-- FROM pg_publication_tables
-- WHERE pubname = 'supabase_realtime' AND tablename = 'drivers';
