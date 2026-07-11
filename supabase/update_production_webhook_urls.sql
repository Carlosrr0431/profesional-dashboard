-- Actualiza URLs de webhooks internos a dominio de producción.
-- Aplicar en el SQL Editor de Supabase.

UPDATE public.settings
SET value = 'https://www.profesionalviajes.com.ar/api/dispatch-worker',
    updated_at = NOW()
WHERE key = 'dispatch_worker_url';

UPDATE public.settings
SET value = 'https://www.profesionalviajes.com.ar/api/Agente_IA',
    updated_at = NOW()
WHERE key = 'whatsapp_trip_transition_url';

-- Verificación
SELECT key, value, updated_at
FROM public.settings
WHERE key IN ('dispatch_worker_url', 'whatsapp_trip_transition_url')
ORDER BY key;
