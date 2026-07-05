-- Corrige auth del despertador dispatch-worker (pg_net → GET /api/dispatch-worker).
--
-- Síntoma en logs de Vercel:
--   http_get_unauthorized, hasAuthHeader=false, viaVercelCron=false
--
-- Causa: dispatch_worker_secret vacío en settings mientras CRON_SECRET está definido en Vercel.
--
-- PASOS (en Supabase SQL Editor):
-- 1) Ejecutar este archivo completo (actualiza la función del trigger).
-- 2) Reemplazar YOUR_CRON_SECRET por el mismo valor que CRON_SECRET en Vercel.
-- 3) Verificar con el SELECT final.

CREATE OR REPLACE FUNCTION public.notify_dispatch_worker_on_queued()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url TEXT;
  v_secret TEXT;
  v_headers JSONB := '{}'::jsonb;
BEGIN
  IF TG_OP NOT IN ('INSERT', 'UPDATE') THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM 'queued' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'queued' THEN
    RETURN NEW;
  END IF;

  SELECT value
  INTO v_url
  FROM public.settings
  WHERE key = 'dispatch_worker_url'
  LIMIT 1;

  SELECT value
  INTO v_secret
  FROM public.settings
  WHERE key = 'dispatch_worker_secret'
  LIMIT 1;

  IF v_url IS NULL OR btrim(v_url) = '' THEN
    RETURN NEW;
  END IF;

  v_headers := jsonb_build_object('Content-Type', 'application/json');
  IF v_secret IS NOT NULL AND btrim(v_secret) <> '' THEN
    v_headers := v_headers || jsonb_build_object(
      'Authorization',
      'Bearer ' || btrim(v_secret),
      'x-cron-secret',
      btrim(v_secret)
    );
  END IF;

  PERFORM net.http_get(
    btrim(v_url),
    '{}'::jsonb,
    v_headers,
    8000
  );

  RETURN NEW;
END;
$$;

-- ⚠️ Reemplazar YOUR_CRON_SECRET por el valor real de CRON_SECRET en Vercel.
UPDATE public.settings
SET value = 'YOUR_CRON_SECRET',
    updated_at = NOW()
WHERE key = 'dispatch_worker_secret';

INSERT INTO public.settings (key, value, updated_at)
VALUES ('dispatch_worker_url', 'https://profesional-dashboard.vercel.app/api/dispatch-worker', NOW())
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = NOW();

SELECT key,
  CASE
    WHEN key = 'dispatch_worker_secret' AND btrim(value) = '' THEN '(vacío — auth fallará)'
    WHEN key = 'dispatch_worker_secret' AND value = 'YOUR_CRON_SECRET' THEN '(placeholder — reemplazar)'
    WHEN key = 'dispatch_worker_secret' THEN LEFT(value, 4) || '…' || RIGHT(value, 4)
    ELSE value
  END AS value_preview,
  updated_at
FROM public.settings
WHERE key IN ('dispatch_worker_url', 'dispatch_worker_secret')
ORDER BY key;
