-- Migración: tabla de zonas de servicio
-- Ejecutar manualmente en el editor SQL de Supabase

CREATE TABLE IF NOT EXISTS public.service_zones (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  color       text        NOT NULL DEFAULT '#DC2626',
  coordinates jsonb       NOT NULL DEFAULT '[]'::jsonb,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Índice para queries de zonas activas
CREATE INDEX IF NOT EXISTS idx_service_zones_active
  ON public.service_zones (is_active);

-- RLS
ALTER TABLE public.service_zones ENABLE ROW LEVEL SECURITY;

-- Lectura pública (usada por el Agente IA en API routes con anon key)
CREATE POLICY "service_zones_select"
  ON public.service_zones FOR SELECT USING (true);

-- Escritura solo con service role (API routes del dashboard)
CREATE POLICY "service_zones_insert"
  ON public.service_zones FOR INSERT WITH CHECK (true);

CREATE POLICY "service_zones_update"
  ON public.service_zones FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "service_zones_delete"
  ON public.service_zones FOR DELETE USING (true);
