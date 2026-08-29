-- Zonas calientes (recargo de tarifa). Independiente de service_zones.
-- Ejecutar manualmente en el editor SQL de Supabase.

CREATE TABLE IF NOT EXISTS public.hot_zones (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text        NOT NULL,
  color                   text        NOT NULL DEFAULT '#D97706',
  coordinates             jsonb       NOT NULL DEFAULT '[]'::jsonb,
  fare_surcharge_percent  numeric     NOT NULL DEFAULT 0,
  is_active               boolean     NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hot_zones_active
  ON public.hot_zones (is_active);

ALTER TABLE public.hot_zones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hot_zones_select" ON public.hot_zones;
CREATE POLICY "hot_zones_select"
  ON public.hot_zones FOR SELECT USING (true);

DROP POLICY IF EXISTS "hot_zones_insert" ON public.hot_zones;
CREATE POLICY "hot_zones_insert"
  ON public.hot_zones FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "hot_zones_update" ON public.hot_zones;
CREATE POLICY "hot_zones_update"
  ON public.hot_zones FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "hot_zones_delete" ON public.hot_zones;
CREATE POLICY "hot_zones_delete"
  ON public.hot_zones FOR DELETE USING (true);
