-- =============================================================================
-- Eliminar claves legacy de TARIFA whatsapp_* (ya migradas a passenger_app_*)
-- Ejecutar manualmente en el editor SQL de Supabase.
--
-- NO elimina whatsapp_trip_transition_url / whatsapp_trip_transition_secret:
-- esas claves son configuración del webhook de viajes, no tarifas.
-- =============================================================================

BEGIN;

DELETE FROM public.settings
WHERE key IN (
  'whatsapp_amt_fare',
  'whatsapp_tariff_base',
  'whatsapp_driver_commission'
);

COMMIT;

-- Verificación: solo deben quedar claves de plataforma + app pasajeros + infra
SELECT key, value, updated_at
FROM public.settings
WHERE key LIKE '%tariff%'
   OR key LIKE '%commission%'
   OR key LIKE 'whatsapp%'
ORDER BY key;
