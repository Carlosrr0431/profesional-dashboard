-- Cache persistente de Place Details Essentials (Google Places API New).
-- Objetivo: evitar llamadas repetidas por el mismo place_id.
-- Ejecutar manualmente en el editor SQL de Supabase.

CREATE TABLE IF NOT EXISTS public.google_place_details_cache (
  id                 uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         timestamptz     NOT NULL DEFAULT now(),
  updated_at         timestamptz     NOT NULL DEFAULT now(),
  last_seen_at       timestamptz     NOT NULL DEFAULT now(),

  -- Place ID canónico con prefijo "google:".
  place_id           text            NOT NULL UNIQUE,

  -- Datos mínimos para resolver pickup/destino sin llamar de nuevo a Google.
  formatted_address  text,
  title              text,
  subtitle           text,
  lat                double precision NOT NULL,
  lng                double precision NOT NULL,
  types              jsonb           NOT NULL DEFAULT '[]'::jsonb,

  CONSTRAINT google_place_details_cache_lat_check CHECK (lat BETWEEN -90 AND 90),
  CONSTRAINT google_place_details_cache_lng_check CHECK (lng BETWEEN -180 AND 180),
  CONSTRAINT google_place_details_cache_place_id_check CHECK (place_id ~ '^google:.+')
);

CREATE INDEX IF NOT EXISTS idx_google_place_details_cache_last_seen
  ON public.google_place_details_cache (last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_google_place_details_cache_coords
  ON public.google_place_details_cache (lat, lng);

COMMENT ON TABLE public.google_place_details_cache IS
  'Cache de Place Details Essentials para reducir llamadas repetidas a Google Places.';

-- updated_at automático
CREATE OR REPLACE FUNCTION public.set_google_place_details_cache_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_google_place_details_cache_updated_at
  ON public.google_place_details_cache;

CREATE TRIGGER trg_google_place_details_cache_updated_at
BEFORE UPDATE ON public.google_place_details_cache
FOR EACH ROW
EXECUTE FUNCTION public.set_google_place_details_cache_updated_at();

ALTER TABLE public.google_place_details_cache ENABLE ROW LEVEL SECURITY;

-- El backend usa service role, pero dejamos políticas explícitas para consistencia.
CREATE POLICY "google_place_details_cache_select"
  ON public.google_place_details_cache
  FOR SELECT
  USING (auth.role() = 'service_role');

CREATE POLICY "google_place_details_cache_insert"
  ON public.google_place_details_cache
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "google_place_details_cache_update"
  ON public.google_place_details_cache
  FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
