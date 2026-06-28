-- Activa/desactiva el agente IA de WhatsApp (POST/GET /api/Agente_IA).
-- Ejecutar en Supabase SQL Editor.

INSERT INTO public.settings (key, value, updated_at)
VALUES ('whatsapp_agent_enabled', 'true', NOW())
ON CONFLICT (key) DO NOTHING;

-- Desactivar manualmente:
-- UPDATE public.settings
-- SET value = 'false', updated_at = NOW()
-- WHERE key = 'whatsapp_agent_enabled';

-- Reactivar manualmente:
-- UPDATE public.settings
-- SET value = 'true', updated_at = NOW()
-- WHERE key = 'whatsapp_agent_enabled';

-- Verificación:
SELECT key, value, updated_at
FROM public.settings
WHERE key = 'whatsapp_agent_enabled';
