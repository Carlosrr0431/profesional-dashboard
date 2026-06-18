-- =============================================================================
-- Renombrar claves legacy whatsapp_* → passenger_app_* (app pasajeros, reservadas)
-- Ejecutar manualmente en el editor SQL de Supabase.
--
-- Mapeo:
--   whatsapp_amt_fare            → passenger_app_tariff_per_km
--   whatsapp_tariff_base         → passenger_app_tariff_base
--   whatsapp_driver_commission   → passenger_app_commission_percent
-- =============================================================================

BEGIN;

-- 1) Copiar valores legacy a las claves nuevas
INSERT INTO public.settings (key, value, updated_at)
SELECT
  CASE s.key
    WHEN 'whatsapp_amt_fare' THEN 'passenger_app_tariff_per_km'
    WHEN 'whatsapp_tariff_base' THEN 'passenger_app_tariff_base'
    WHEN 'whatsapp_driver_commission' THEN 'passenger_app_commission_percent'
  END,
  s.value,
  NOW()
FROM public.settings s
WHERE s.key IN (
  'whatsapp_amt_fare',
  'whatsapp_tariff_base',
  'whatsapp_driver_commission'
)
ON CONFLICT (key) DO UPDATE
SET
  value = EXCLUDED.value,
  updated_at = EXCLUDED.updated_at;

-- 2) Valores por defecto si no existían ni las claves viejas ni las nuevas
INSERT INTO public.settings (key, value, updated_at)
VALUES
  ('passenger_app_tariff_per_km', '1000', NOW()),
  ('passenger_app_tariff_base', '0', NOW()),
  ('passenger_app_commission_percent', '50', NOW())
ON CONFLICT (key) DO NOTHING;

-- 3) Eliminar claves legacy
DELETE FROM public.settings
WHERE key IN (
  'whatsapp_amt_fare',
  'whatsapp_tariff_base',
  'whatsapp_driver_commission'
);

COMMIT;

-- 4) Verificación
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
