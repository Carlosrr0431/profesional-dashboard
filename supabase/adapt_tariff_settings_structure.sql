-- =============================================================================
-- Migración: estructura de tarifas (plataforma activa + app pasajeros reservada)
-- Ejecutar manualmente en el editor SQL de Supabase.
--
-- TARIFA ACTIVA (plataforma):
--   platform_tariff_per_km, platform_tariff_base, platform_commission_percent
--
-- RESERVADA — app pasajeros (próximamente, NO usada por el código actual):
--   passenger_app_tariff_per_km, passenger_app_tariff_base, passenger_app_commission_percent
-- =============================================================================

BEGIN;

INSERT INTO public.settings (key, value, updated_at)
VALUES
  ('platform_tariff_per_km', '1000', NOW()),
  ('platform_tariff_base', '0', NOW()),
  ('platform_commission_percent', '50', NOW())
ON CONFLICT (key) DO UPDATE
SET
  value = EXCLUDED.value,
  updated_at = EXCLUDED.updated_at
WHERE public.settings.key IN (
  'platform_tariff_per_km',
  'platform_tariff_base',
  'platform_commission_percent'
);

INSERT INTO public.settings (key, value, updated_at)
VALUES
  ('passenger_app_tariff_per_km', '1000', NOW()),
  ('passenger_app_tariff_base', '0', NOW()),
  ('passenger_app_commission_percent', '50', NOW())
ON CONFLICT (key) DO UPDATE
SET
  value = EXCLUDED.value,
  updated_at = EXCLUDED.updated_at
WHERE public.settings.key IN (
  'passenger_app_tariff_per_km',
  'passenger_app_tariff_base',
  'passenger_app_commission_percent'
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Conductores leen settings" ON public.settings;
CREATE POLICY "Conductores leen settings"
  ON public.settings
  FOR SELECT
  TO authenticated
  USING (true);

COMMIT;

SELECT
  key,
  value,
  updated_at,
  CASE
    WHEN key IN (
      'platform_tariff_per_km',
      'platform_tariff_base',
      'platform_commission_percent'
    )
      THEN 'ACTIVO — precio de plataforma'
    WHEN key IN (
      'passenger_app_tariff_per_km',
      'passenger_app_tariff_base',
      'passenger_app_commission_percent'
    )
      THEN 'RESERVADO — app pasajeros (próximamente)'
    ELSE 'otro'
  END AS rol
FROM public.settings
WHERE key IN (
  'platform_tariff_per_km',
  'platform_tariff_base',
  'platform_commission_percent',
  'passenger_app_tariff_per_km',
  'passenger_app_tariff_base',
  'passenger_app_commission_percent'
)
ORDER BY
  CASE
    WHEN key LIKE 'platform_%' THEN 0
    ELSE 1
  END,
  key;
