-- Restaura la URL y el secret del webhook trip.transition.
-- Necesario cuando disable_trip_transition_http_trigger.sql vació settings
-- pero el trigger sigue activo, o cuando Vercel tiene WHATSAPP_TRIP_TRANSITION_SECRET
-- pero la BD no.
--
-- IMPORTANTE: el valor del secret debe coincidir con WHATSAPP_TRIP_TRANSITION_SECRET en Vercel.

INSERT INTO public.settings (key, value, updated_at)
VALUES
  (
    'whatsapp_trip_transition_url',
    'https://profesional-dashboard.vercel.app/api/Agente_IA',
    NOW()
  ),
  (
    'whatsapp_trip_transition_secret',
    '49225fc6fbe7dfb8bdef9177e2fef58ebaec023e3e74be0fe7c709d2357e3a13',
    NOW()
  )
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = NOW();

-- Verificación
SELECT key, LEFT(value, 20) || CASE WHEN length(value) > 20 THEN '...' ELSE '' END AS value_preview, updated_at
FROM public.settings
WHERE key IN ('whatsapp_trip_transition_url', 'whatsapp_trip_transition_secret')
ORDER BY key;
