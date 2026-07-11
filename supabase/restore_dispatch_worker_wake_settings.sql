-- Configuración del webhook que despierta dispatch-worker al encolar viajes.
-- IMPORTANTE: dispatch_worker_secret debe coincidir EXACTAMENTE con CRON_SECRET en Vercel.
-- Si CRON_SECRET está vacío en Vercel, dejá dispatch_worker_secret vacío también.
--
-- Si ves http_get_unauthorized en logs, ejecutá fix_dispatch_worker_wake_auth.sql

INSERT INTO public.settings (key, value, updated_at)
VALUES
  (
    'dispatch_worker_url',
    'https://www.profesionalviajes.com.ar/api/dispatch-worker',
    NOW()
  ),
  (
    'dispatch_worker_secret',
    '',
    NOW()
  )
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = NOW();

-- Verificación
SELECT key,
  LEFT(value, 40) || CASE WHEN length(value) > 40 THEN '...' ELSE '' END AS value_preview,
  updated_at
FROM public.settings
WHERE key IN ('dispatch_worker_url', 'dispatch_worker_secret')
ORDER BY key;
