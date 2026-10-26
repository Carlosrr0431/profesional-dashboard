-- Contador y caché de Places API (New).
-- Cada búsqueda se guarda entera, y cada lugar de esa búsqueda también.
-- El contador no pasa de 9000 llamadas por mes (el recargo de Google empieza en 10000).
-- Ejecutar una vez en el editor SQL de Supabase.

CREATE TABLE IF NOT EXISTS public.google_places_usage (
  period       text        PRIMARY KEY,
  call_count   integer     NOT NULL DEFAULT 0 CHECK (call_count >= 0),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.google_places_search_cache (
  query_key     text        PRIMARY KEY,
  suggestions   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.google_places_poi_cache (
  place_id           text        PRIMARY KEY,
  title              text,
  subtitle           text,
  formatted_address  text,
  lat                double precision,
  lng                double precision,
  types              jsonb       NOT NULL DEFAULT '[]'::jsonb,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT google_places_poi_cache_place_id_check CHECK (place_id ~ '^google:.+')
);

CREATE INDEX IF NOT EXISTS idx_google_places_poi_cache_updated
  ON public.google_places_poi_cache (updated_at DESC);

ALTER TABLE public.google_places_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_places_search_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_places_poi_cache ENABLE ROW LEVEL SECURITY;

-- Suma 1 solo si el mes todavía está bajo el tope. Si ya llegó, no cambia la fila y devuelve null.
CREATE OR REPLACE FUNCTION public.consume_google_places_call(p_period text, p_limit integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_count integer;
BEGIN
  INSERT INTO public.google_places_usage (period, call_count)
  VALUES (p_period, 1)
  ON CONFLICT (period) DO UPDATE
    SET call_count = public.google_places_usage.call_count + 1,
        updated_at = now()
    WHERE public.google_places_usage.call_count < p_limit
  RETURNING call_count INTO next_count;

  RETURN next_count;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_google_places_call(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_google_places_call(text, integer) TO service_role;
