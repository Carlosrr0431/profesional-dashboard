-- =============================================================================
-- Renombrar claves de tarifa de plataforma → prefijo platform_*
-- Ejecutar manualmente en el editor SQL de Supabase.
--
-- Mapeo:
--   tariff_per_km       → platform_tariff_per_km
--   tariff_base         → platform_tariff_base
--   commission_percent  → platform_commission_percent
-- =============================================================================

BEGIN;

INSERT INTO public.settings (key, value, updated_at)
SELECT
  CASE s.key
    WHEN 'tariff_per_km' THEN 'platform_tariff_per_km'
    WHEN 'tariff_base' THEN 'platform_tariff_base'
    WHEN 'commission_percent' THEN 'platform_commission_percent'
  END,
  s.value,
  NOW()
FROM public.settings s
WHERE s.key IN ('tariff_per_km', 'tariff_base', 'commission_percent')
ON CONFLICT (key) DO UPDATE
SET
  value = EXCLUDED.value,
  updated_at = EXCLUDED.updated_at;

INSERT INTO public.settings (key, value, updated_at)
VALUES
  ('platform_tariff_per_km', '1000', NOW()),
  ('platform_tariff_base', '0', NOW()),
  ('platform_commission_percent', '50', NOW())
ON CONFLICT (key) DO NOTHING;

DELETE FROM public.settings
WHERE key IN ('tariff_per_km', 'tariff_base', 'commission_percent');

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
