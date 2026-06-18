-- Paradas intermedias en viajes multi-destino (passenger-app).
-- Aplicar manualmente en el editor SQL de Supabase.
--
-- Las paradas se persisten principalmente en `notes` como:
--   [WAYPOINTS_JSON:[{"address":"...","lat":-24.79,"lng":-65.41},...]]
-- siguiendo el mismo patrón que PICKUP_JSON y FINAL_DEST_JSON.
--
-- Esta columna opcional permite consultas directas sin parsear notes.
-- Viajes existentes (sin paradas) no requieren cambios.

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS waypoints JSONB DEFAULT NULL;

COMMENT ON COLUMN trips.waypoints IS
  'Paradas intermedias ordenadas [{address, lat, lng}] entre origin y destination. NULL = viaje punto a punto.';
