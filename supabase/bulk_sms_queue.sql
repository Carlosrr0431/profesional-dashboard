-- Cola de SMS masivo (SMSGate / J7).
-- Ritmo lento para no saturar el celular ni pisar el OTP (prioridad 100).
-- SMSGate no envía MMS: el texto puede incluir un link a una foto.
-- Ejecutar manualmente en el editor SQL de Supabase.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.sms_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_by_email text,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'done', 'cancelled')),
  channel text NOT NULL DEFAULT 'sms'
    CHECK (channel IN ('sms', 'whatsapp')),
  body text NOT NULL DEFAULT '',
  link text,
  image_url text,
  composed_text text NOT NULL DEFAULT '',
  body_hash text NOT NULL,
  recipient_count integer NOT NULL DEFAULT 0 CHECK (recipient_count >= 0),
  queued_count integer NOT NULL DEFAULT 0 CHECK (queued_count >= 0),
  skipped_count integer NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  respect_quiet_hours boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.sms_outbound_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.sms_campaigns(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  channel text NOT NULL DEFAULT 'sms'
    CHECK (channel IN ('sms', 'whatsapp')),
  phone_local text NOT NULL,
  body text NOT NULL DEFAULT '',
  body_hash text NOT NULL,
  image_url text,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'skipped')),
  skip_reason text,
  available_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  claimed_by text,
  sent_at timestamptz,
  gateway_message_id text,
  last_error text,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts >= 1)
);

CREATE TABLE IF NOT EXISTS public.sms_send_throttle (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_sent_at timestamptz,
  interval_ms integer NOT NULL DEFAULT 12000 CHECK (interval_ms >= 5000),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.sms_send_throttle (id, last_sent_at, interval_ms)
VALUES (1, NULL, 12000)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.bulk_whatsapp_throttle (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_sent_at timestamptz,
  interval_ms integer NOT NULL DEFAULT 30000 CHECK (interval_ms >= 5000),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.bulk_whatsapp_throttle (id, last_sent_at, interval_ms)
VALUES (1, NULL, 30000)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.sms_campaigns
  ADD COLUMN IF NOT EXISTS channel text;
ALTER TABLE public.sms_outbound_queue
  ADD COLUMN IF NOT EXISTS channel text;
ALTER TABLE public.sms_outbound_queue
  ADD COLUMN IF NOT EXISTS image_url text;

UPDATE public.sms_campaigns SET channel = 'sms' WHERE channel IS NULL;
UPDATE public.sms_outbound_queue SET channel = 'sms' WHERE channel IS NULL;
ALTER TABLE public.sms_campaigns ALTER COLUMN respect_quiet_hours SET DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_sms_outbound_ready
  ON public.sms_outbound_queue (channel, available_at, created_at)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_sms_outbound_campaign
  ON public.sms_outbound_queue (campaign_id, status);

CREATE INDEX IF NOT EXISTS idx_sms_outbound_cooldown
  ON public.sms_outbound_queue (channel, phone_local, body_hash, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_outbound_campaign_phone_active
  ON public.sms_outbound_queue (campaign_id, phone_local)
  WHERE status IN ('queued', 'sending');

CREATE INDEX IF NOT EXISTS idx_sms_campaigns_created
  ON public.sms_campaigns (created_at DESC);

CREATE OR REPLACE FUNCTION public.set_sms_outbound_queue_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sms_outbound_queue_updated_at ON public.sms_outbound_queue;
CREATE TRIGGER trg_sms_outbound_queue_updated_at
BEFORE UPDATE ON public.sms_outbound_queue
FOR EACH ROW
EXECUTE FUNCTION public.set_sms_outbound_queue_updated_at();

CREATE OR REPLACE FUNCTION public.release_stale_sms_outbound(p_stale_after_seconds INTEGER DEFAULT 120)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.sms_outbound_queue
  SET
    status = 'queued',
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

-- Claim atómico: 1 SMS listo + respeta el intervalo del J7.
CREATE OR REPLACE FUNCTION public.claim_sms_outbound_message(p_claimer TEXT DEFAULT 'worker')
RETURNS SETOF public.sms_outbound_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_interval_ms INTEGER;
  v_last TIMESTAMPTZ;
  v_row public.sms_outbound_queue%ROWTYPE;
BEGIN
  INSERT INTO public.sms_send_throttle (id, last_sent_at, interval_ms)
  VALUES (1, NULL, 12000)
  ON CONFLICT (id) DO NOTHING;

  SELECT interval_ms, last_sent_at
  INTO v_interval_ms, v_last
  FROM public.sms_send_throttle
  WHERE id = 1
  FOR UPDATE;

  IF v_last IS NOT NULL
     AND (EXTRACT(EPOCH FROM (v_now - v_last)) * 1000) < COALESCE(v_interval_ms, 12000) THEN
    RETURN;
  END IF;

  UPDATE public.sms_outbound_queue
  SET
    status = 'sending',
    claimed_at = v_now,
    claimed_by = NULLIF(TRIM(p_claimer), ''),
    attempts = attempts + 1
  WHERE id = (
    SELECT q.id
    FROM public.sms_outbound_queue q
    WHERE q.status = 'queued'
      AND COALESCE(q.channel, 'sms') = 'sms'
      AND q.available_at <= v_now
      AND q.attempts < q.max_attempts
    ORDER BY q.available_at ASC, q.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.sms_send_throttle
  SET last_sent_at = v_now, updated_at = v_now
  WHERE id = 1;

  RETURN NEXT v_row;
END;
$$;

-- Claim WhatsApp masivo: 1 mensaje / 30s, cola aparte de viajes.
CREATE OR REPLACE FUNCTION public.claim_whatsapp_bulk_message(p_claimer TEXT DEFAULT 'worker')
RETURNS SETOF public.sms_outbound_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_interval_ms INTEGER;
  v_last TIMESTAMPTZ;
  v_row public.sms_outbound_queue%ROWTYPE;
BEGIN
  INSERT INTO public.bulk_whatsapp_throttle (id, last_sent_at, interval_ms)
  VALUES (1, NULL, 30000)
  ON CONFLICT (id) DO NOTHING;

  SELECT interval_ms, last_sent_at
  INTO v_interval_ms, v_last
  FROM public.bulk_whatsapp_throttle
  WHERE id = 1
  FOR UPDATE;

  IF v_last IS NOT NULL
     AND (EXTRACT(EPOCH FROM (v_now - v_last)) * 1000) < COALESCE(v_interval_ms, 30000) THEN
    RETURN;
  END IF;

  UPDATE public.sms_outbound_queue
  SET
    status = 'sending',
    claimed_at = v_now,
    claimed_by = NULLIF(TRIM(p_claimer), ''),
    attempts = attempts + 1
  WHERE id = (
    SELECT q.id
    FROM public.sms_outbound_queue q
    WHERE q.status = 'queued'
      AND q.channel = 'whatsapp'
      AND q.available_at <= v_now
      AND q.attempts < q.max_attempts
    ORDER BY q.available_at ASC, q.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.bulk_whatsapp_throttle
  SET last_sent_at = v_now, updated_at = v_now
  WHERE id = 1;

  RETURN NEXT v_row;
END;
$$;

ALTER TABLE public.sms_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_outbound_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_send_throttle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulk_whatsapp_throttle ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.sms_campaigns FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.sms_outbound_queue FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.sms_send_throttle FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.bulk_whatsapp_throttle FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.sms_campaigns TO service_role;
GRANT ALL ON TABLE public.sms_outbound_queue TO service_role;
GRANT ALL ON TABLE public.sms_send_throttle TO service_role;
GRANT ALL ON TABLE public.bulk_whatsapp_throttle TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_sms_outbound_message(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_bulk_message(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_stale_sms_outbound(INTEGER) TO service_role;

COMMENT ON TABLE public.sms_campaigns IS
  'Campañas de difusión masiva (SMS o WhatsApp) del dashboard.';
COMMENT ON TABLE public.sms_outbound_queue IS
  'Cola masiva. SMS prioridad 0 vs OTP 100. WhatsApp 30s, separado de la cola de viajes.';
