-- Cola de salida WhatsApp (whatsmeow).
-- Throttle POR LÍNEA: cada agent_code envía 1 mensaje cada interval_ms (default 15s).
-- Las dos líneas pueden enviar en paralelo. Ver también whatsapp_outbound_queue_v2.sql
-- si esta migración ya se aplicó en la versión global.
--
-- Ejecutar manualmente en el SQL editor de Supabase.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.whatsapp_send_throttle (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_sent_at TIMESTAMPTZ,
  interval_ms INTEGER NOT NULL DEFAULT 15000 CHECK (interval_ms >= 1000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.whatsapp_send_throttle (id, last_sent_at, interval_ms)
VALUES (1, NULL, 15000)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.whatsapp_line_throttle (
  agent_code TEXT PRIMARY KEY,
  last_sent_at TIMESTAMPTZ,
  interval_ms INTEGER NOT NULL DEFAULT 15000 CHECK (interval_ms >= 1000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_outbound_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_code TEXT NOT NULL,
  dest TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('text', 'poll')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts >= 1),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ,
  claimed_by TEXT,
  sent_at TIMESTAMPTZ,
  message_id TEXT,
  last_error TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedup_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_outbound_queue_ready
  ON public.whatsapp_outbound_queue (status, available_at, priority DESC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_outbound_queue_created
  ON public.whatsapp_outbound_queue (created_at DESC);

ALTER TABLE public.whatsapp_outbound_queue
  ADD COLUMN IF NOT EXISTS dedup_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_outbound_pending_dedup
  ON public.whatsapp_outbound_queue (agent_code, dedup_key)
  WHERE status IN ('pending', 'sending') AND dedup_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_outbound_queue_ready_agent
  ON public.whatsapp_outbound_queue (agent_code, status, available_at, priority DESC, created_at ASC);

CREATE OR REPLACE FUNCTION public.set_whatsapp_outbound_queue_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_whatsapp_outbound_queue_updated_at ON public.whatsapp_outbound_queue;
CREATE TRIGGER trg_whatsapp_outbound_queue_updated_at
BEFORE UPDATE ON public.whatsapp_outbound_queue
FOR EACH ROW
EXECUTE FUNCTION public.set_whatsapp_outbound_queue_updated_at();

-- Libera filas stuck en 'sending' (worker caído / timeout serverless).
CREATE OR REPLACE FUNCTION public.release_stale_whatsapp_outbound(p_stale_after_seconds INTEGER DEFAULT 120)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.whatsapp_outbound_queue
  SET
    status = 'pending',
    claimed_at = NULL,
    claimed_by = NULL,
    last_error = COALESCE(last_error, 'stale_sending_released'),
    available_at = NOW()
  WHERE status = 'sending'
    AND claimed_at IS NOT NULL
    AND claimed_at < NOW() - make_interval(secs => GREATEST(30, p_stale_after_seconds));

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Claim atómico: reserva slot de throttle POR LÍNEA + toma el próximo mensaje listo.
CREATE OR REPLACE FUNCTION public.claim_whatsapp_outbound_message(p_claimer TEXT DEFAULT 'worker')
RETURNS SETOF public.whatsapp_outbound_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_interval_ms INTEGER;
  v_last TIMESTAMPTZ;
  v_row public.whatsapp_outbound_queue%ROWTYPE;
  v_cand public.whatsapp_outbound_queue%ROWTYPE;
BEGIN
  FOR v_cand IN
    SELECT q.*
    FROM public.whatsapp_outbound_queue q
    WHERE q.status = 'pending'
      AND q.available_at <= v_now
      AND q.attempts < q.max_attempts
      AND NOT EXISTS (
        SELECT 1
        FROM public.whatsapp_line_throttle t
        WHERE t.agent_code = q.agent_code
          AND t.last_sent_at IS NOT NULL
          AND (EXTRACT(EPOCH FROM (v_now - t.last_sent_at)) * 1000)
              < COALESCE(t.interval_ms, 15000)
      )
    ORDER BY q.priority DESC, q.created_at ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    INSERT INTO public.whatsapp_line_throttle (agent_code, last_sent_at, interval_ms)
    VALUES (v_cand.agent_code, NULL, 15000)
    ON CONFLICT (agent_code) DO NOTHING;

    SELECT interval_ms, last_sent_at
    INTO v_interval_ms, v_last
    FROM public.whatsapp_line_throttle
    WHERE agent_code = v_cand.agent_code
    FOR UPDATE;

    IF v_last IS NOT NULL
       AND (EXTRACT(EPOCH FROM (v_now - v_last)) * 1000) < COALESCE(v_interval_ms, 15000) THEN
      CONTINUE;
    END IF;

    UPDATE public.whatsapp_outbound_queue
    SET
      status = 'sending',
      claimed_at = v_now,
      claimed_by = NULLIF(TRIM(p_claimer), ''),
      attempts = attempts + 1
    WHERE id = v_cand.id
    RETURNING * INTO v_row;

    UPDATE public.whatsapp_line_throttle
    SET last_sent_at = v_now, updated_at = v_now
    WHERE agent_code = v_row.agent_code;

    RETURN NEXT v_row;
    RETURN;
  END LOOP;
END;
$$;

ALTER TABLE public.whatsapp_outbound_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_send_throttle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_line_throttle ENABLE ROW LEVEL SECURITY;

-- Solo service_role (API routes) opera la cola; sin policies para anon/authenticated.
REVOKE ALL ON TABLE public.whatsapp_outbound_queue FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.whatsapp_send_throttle FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.whatsapp_line_throttle FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.whatsapp_outbound_queue TO service_role;
GRANT ALL ON TABLE public.whatsapp_send_throttle TO service_role;
GRANT ALL ON TABLE public.whatsapp_line_throttle TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_outbound_message(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_stale_whatsapp_outbound(INTEGER) TO service_role;
