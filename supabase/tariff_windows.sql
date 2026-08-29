-- =============================================================================
-- Franjas horarias de tarifa + keys de la web de pasajeros.
-- Ejecutar manualmente en el editor SQL de Supabase.
--
-- Canales:
--   platform       → WhatsApp y panel
--   passenger_app  → app nativa de pasajeros
--   passenger_web  → https://www.profesionalviajes.com.ar/pasajero
--
-- start_minute / end_minute: minutos desde 00:00 (hora Argentina).
-- Si start > end, la franja cruza medianoche (ej. 22:00–06:00).
-- Si no hay franja activa, vale la tarifa default de settings.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.tariff_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL CHECK (channel IN ('platform', 'passenger_app', 'passenger_web')),
  start_minute smallint NOT NULL CHECK (start_minute >= 0 AND start_minute < 1440),
  end_minute smallint NOT NULL CHECK (end_minute >= 0 AND end_minute < 1440),
  per_km numeric NOT NULL DEFAULT 0 CHECK (per_km >= 0),
  base numeric NOT NULL DEFAULT 0 CHECK (base >= 0),
  commission_percent numeric NOT NULL DEFAULT 0 CHECK (commission_percent >= 0 AND commission_percent <= 100),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tariff_windows_range_chk CHECK (start_minute <> end_minute)
);

CREATE INDEX IF NOT EXISTS idx_tariff_windows_channel_enabled
  ON public.tariff_windows (channel, enabled);

ALTER TABLE public.tariff_windows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tariff_windows_select" ON public.tariff_windows;
CREATE POLICY "tariff_windows_select"
  ON public.tariff_windows
  FOR SELECT
  USING (true);

GRANT SELECT ON TABLE public.tariff_windows TO anon, authenticated;
GRANT ALL ON TABLE public.tariff_windows TO service_role;

INSERT INTO public.settings (key, value, updated_at)
SELECT 'passenger_web_tariff_per_km', value, NOW()
FROM public.settings
WHERE key = 'passenger_app_tariff_per_km'
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.settings (key, value, updated_at)
SELECT 'passenger_web_tariff_base', value, NOW()
FROM public.settings
WHERE key = 'passenger_app_tariff_base'
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.settings (key, value, updated_at)
SELECT 'passenger_web_commission_percent', value, NOW()
FROM public.settings
WHERE key = 'passenger_app_commission_percent'
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.settings (key, value, updated_at)
VALUES
  ('passenger_web_tariff_per_km', '600', NOW()),
  ('passenger_web_tariff_base', '0', NOW()),
  ('passenger_web_commission_percent', '50', NOW())
ON CONFLICT (key) DO NOTHING;

COMMIT;
