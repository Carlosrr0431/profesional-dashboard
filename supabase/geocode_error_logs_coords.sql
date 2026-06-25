-- Columnas opcionales para registrar coordenadas incorrectas reportadas por operadores.
-- Ejecutar en Supabase si ya creaste geocode_error_logs sin estas columnas.

ALTER TABLE public.geocode_error_logs
  ADD COLUMN IF NOT EXISTS result_lat double precision,
  ADD COLUMN IF NOT EXISTS result_lng double precision;

COMMENT ON COLUMN public.geocode_error_logs.result_lat IS
  'Latitud devuelta por OSM/Nominatim cuando el operador reporta ubicación incorrecta.';
COMMENT ON COLUMN public.geocode_error_logs.result_lng IS
  'Longitud devuelta por OSM/Nominatim cuando el operador reporta ubicación incorrecta.';
