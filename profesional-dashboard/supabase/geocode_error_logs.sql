-- Registro de errores de geocodificación (OSM/Nominatim) para seguimiento operativo.
-- Ejecutar manualmente en el editor SQL de Supabase.

CREATE TABLE IF NOT EXISTS public.geocode_error_logs (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz NOT NULL DEFAULT now(),
  occurrence_count    integer     NOT NULL DEFAULT 1 CHECK (occurrence_count > 0),

  -- Contexto de la búsqueda (Google Autocomplete + geocode)
  place_id            text,
  formatted_address   text,
  title               text,
  subtitle            text,
  address             text,
  request_path        text        NOT NULL DEFAULT '/api/geo/geocode',

  error_message       text        NOT NULL,
  http_status         integer     NOT NULL DEFAULT 404,

  -- Coordenadas devueltas por OSM cuando el operador reporta ubicación incorrecta
  result_lat          double precision,
  result_lng          double precision,

  -- Seguimiento de resolución en el dashboard
  resolved            boolean     NOT NULL DEFAULT false,
  resolved_at         timestamptz,
  resolved_note       text,

  -- Dedup: misma búsqueda + mismo error
  search_fingerprint  text        NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_geocode_error_logs_pending
  ON public.geocode_error_logs (resolved, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_geocode_error_logs_last_seen
  ON public.geocode_error_logs (last_seen_at DESC);

COMMENT ON TABLE public.geocode_error_logs IS
  'Errores de /api/geo/geocode para auditoría y corrección de POIs/direcciones en OSM.';

ALTER TABLE public.geocode_error_logs ENABLE ROW LEVEL SECURITY;

-- Solo el backend (service role) escribe y lee. El dashboard usa API routes.
CREATE POLICY "geocode_error_logs_select"
  ON public.geocode_error_logs FOR SELECT USING (true);

CREATE POLICY "geocode_error_logs_insert"
  ON public.geocode_error_logs FOR INSERT WITH CHECK (true);

CREATE POLICY "geocode_error_logs_update"
  ON public.geocode_error_logs FOR UPDATE USING (true) WITH CHECK (true);
