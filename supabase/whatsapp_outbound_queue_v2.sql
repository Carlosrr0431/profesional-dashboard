-- Cola WhatsApp v2: throttle POR LÍNEA (cada agent_code 1 msg / 15s).
-- Las dos líneas pueden enviar en paralelo sin bloquearse entre sí.
-- Dedup: no encola el mismo texto/poll pendiente dos veces.
--
-- Ejecutar manualmente en el SQL editor de Supabase (después de whatsapp_outbound_queue.sql).

CREATE TABLE IF NOT EXISTS public.whatsapp_line_throttle (
  agent_code TEXT PRIMARY KEY,
  last_sent_at TIMESTAMPTZ,
  interval_ms INTEGER NOT NULL DEFAULT 15000 CHECK (interval_ms >= 1000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.whatsapp_outbound_queue
  ADD COLUMN IF NOT EXISTS dedup_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_outbound_pending_dedup
  ON public.whatsapp_outbound_queue (agent_code, dedup_key)
  WHERE status IN ('pending', 'sending') AND dedup_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_outbound_queue_ready_agent
  ON public.whatsapp_outbound_queue (agent_code, status, available_at, priority DESC, created_at ASC);

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

ALTER TABLE public.whatsapp_line_throttle ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.whatsapp_line_throttle FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.whatsapp_line_throttle TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_outbound_message(TEXT) TO service_role;
