-- ============================================================
-- OTP y sesiones de la app de pasajeros
-- Aplicar manualmente en el editor SQL de Supabase.
-- Solo el service_role (API del dashboard) accede a estas tablas.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.passenger_otp_codes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         TEXT NOT NULL,
  code          TEXT NOT NULL,
  attempts      INT  NOT NULL DEFAULT 0,
  expires_at    TIMESTAMPTZ NOT NULL,
  verified_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS passenger_otp_codes_phone_created_idx
  ON public.passenger_otp_codes (phone, created_at DESC);

CREATE INDEX IF NOT EXISTS passenger_otp_codes_expires_idx
  ON public.passenger_otp_codes (expires_at);

CREATE TABLE IF NOT EXISTS public.passenger_auth_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         TEXT NOT NULL,
  token         TEXT NOT NULL UNIQUE,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS passenger_auth_sessions_phone_idx
  ON public.passenger_auth_sessions (phone);

CREATE INDEX IF NOT EXISTS passenger_auth_sessions_token_idx
  ON public.passenger_auth_sessions (token);

ALTER TABLE public.passenger_otp_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passenger_auth_sessions ENABLE ROW LEVEL SECURITY;

-- Sin políticas para anon/authenticated → solo service_role.
