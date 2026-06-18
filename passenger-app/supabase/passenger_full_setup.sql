-- ============================================================
-- PASSENGER-APP — Setup centralizado sobre la BD existente
-- Ejecutar en el Editor SQL de Supabase
--
-- ¡NO CREA TABLAS NUEVAS! Todas las tablas ya existen y son
-- compartidas con driver-app y profesional-dashboard.
--
-- Solo agrega/corrige:
--   1. Columnas que aún podrían faltar en trips
--   2. Constraint de status con 'queued'
--   3. Políticas RLS que habilitan acceso anónimo (passenger-app)
--   4. Realtime en las tablas que el pasajero suscribe
-- ============================================================

-- ============================================================
-- TABLAS EXISTENTES QUE USA LA PASSENGER-APP
-- (referencia — ya creadas por driver-app/dashboard)
-- ============================================================
--
--  drivers         → nombre, vehículo, patente del conductor asignado
--  trips           → crear viaje, leer estado, cancelar
--  driver_locations → ubicación en tiempo real del conductor
--  settings        → tarifa por km (solo lectura)
--
-- ============================================================


-- ============================================================
-- 1. COLUMNAS FALTANTES EN trips
--    Idempotentes: IF NOT EXISTS no rompe nada si ya existen
-- ============================================================

-- dispatch_status: ya agregado por dispatch_architecture_v2.sql.
-- Si ese script NO fue ejecutado, este bloque lo agrega como TEXT.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'trips'
      AND column_name  = 'dispatch_status'
  ) THEN
    ALTER TABLE public.trips ADD COLUMN dispatch_status TEXT DEFAULT 'queued';
  END IF;
END $$;

-- scheduled_for: viajes programados
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;

-- wa_notified_at y wa_context: integración WhatsApp (nullable, sin efecto en pasajeros)
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS wa_notified_at TIMESTAMPTZ;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS wa_context     JSONB;

-- commission_amount
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS commission_amount DECIMAL(10,2) DEFAULT 0;

-- Hacer NULLables los campos que no existen al momento de crear el viaje en cola
ALTER TABLE public.trips ALTER COLUMN driver_id           DROP NOT NULL;
ALTER TABLE public.trips ALTER COLUMN origin_address      DROP NOT NULL;
ALTER TABLE public.trips ALTER COLUMN origin_lat          DROP NOT NULL;
ALTER TABLE public.trips ALTER COLUMN origin_lng          DROP NOT NULL;
ALTER TABLE public.trips ALTER COLUMN destination_address DROP NOT NULL;
ALTER TABLE public.trips ALTER COLUMN destination_lat     DROP NOT NULL;
ALTER TABLE public.trips ALTER COLUMN destination_lng     DROP NOT NULL;
ALTER TABLE public.trips ALTER COLUMN passenger_name      DROP NOT NULL;


-- ============================================================
-- 2. CONSTRAINT DE STATUS — incluir 'queued' y 'scheduled'
--    (ya lo hace add_queued_status_to_trips.sql y
--     add_scheduled_trips_support.sql, pero por si no fue ejecutado)
-- ============================================================
ALTER TABLE public.trips DROP CONSTRAINT IF EXISTS trips_status_check;

ALTER TABLE public.trips
  ADD CONSTRAINT trips_status_check
  CHECK (status IN (
    'scheduled',
    'queued',
    'pending',
    'accepted',
    'going_to_pickup',
    'in_progress',
    'completed',
    'cancelled'
  ));


-- ============================================================
-- 3. FUNCIÓN get_my_driver_id (necesaria para RLS sin recursión)
--    Ya existe si fix_drivers_rls_recursion.sql fue ejecutado.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_driver_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM public.drivers WHERE user_id = auth.uid() LIMIT 1;
$$;


-- ============================================================
-- 4. RLS — TABLA: drivers
--
--    La passenger-app necesita leer nombre, vehículo y ubicación
--    del conductor asignado al viaje.
--
--    La política "Dashboard lee drivers" (anon SELECT) ya existe
--    si fix_drivers_rls_recursion.sql fue aplicado.
--    Este bloque la agrega si falta, sin borrar las existentes.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'drivers'
      AND policyname = 'Dashboard lee drivers'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "Dashboard lee drivers"
        ON public.drivers FOR SELECT
        TO anon
        USING (true)
    $pol$;
  END IF;
END $$;


-- ============================================================
-- 5. RLS — TABLA: trips
--
--    La passenger-app (anon) necesita:
--      • SELECT: seguimiento del viaje en tiempo real
--      • UPDATE: cancelar el viaje (status = 'cancelled')
--
--    INSERT no se hace desde la app: el pasajero llama al endpoint
--    del dashboard (POST /api/trips/create-queued) que usa
--    service_role key y no pasa por RLS.
--
--    Las políticas "Dashboard lee/actualiza viajes" (anon) ya
--    existen si fix_trips_rls_recursion.sql fue aplicado.
-- ============================================================

-- SELECT
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'trips'
      AND policyname = 'Dashboard lee viajes'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "Dashboard lee viajes"
        ON public.trips FOR SELECT
        TO anon
        USING (true)
    $pol$;
  END IF;
END $$;

-- UPDATE (para cancelar)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'trips'
      AND policyname = 'Dashboard actualiza viajes'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "Dashboard actualiza viajes"
        ON public.trips FOR UPDATE
        TO anon
        USING (true)
    $pol$;
  END IF;
END $$;

-- INSERT (por si la app inserta directamente en algún futuro)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'trips'
      AND policyname = 'Dashboard inserta viajes'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "Dashboard inserta viajes"
        ON public.trips FOR INSERT
        TO anon
        WITH CHECK (true)
    $pol$;
  END IF;
END $$;


-- ============================================================
-- 6. RLS — TABLA: driver_locations
--
--    La passenger-app suscribe en tiempo real a cambios de
--    driver_locations para mostrar al conductor en el mapa.
--
--    La política "Dashboard lee ubicaciones" (anon SELECT) ya
--    existe si fix_realtime_anon_policies.sql fue aplicado.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'driver_locations'
      AND policyname = 'Dashboard lee ubicaciones'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "Dashboard lee ubicaciones"
        ON public.driver_locations FOR SELECT
        TO anon
        USING (true)
    $pol$;
  END IF;
END $$;


-- ============================================================
-- 7. REALTIME — habilitar en las tablas que el pasajero suscribe
--
--    Si ya fueron agregadas por migraciones anteriores, Postgres
--    ignora el ADD TABLE (no lanza error).
-- ============================================================
DO $$
BEGIN
  -- trips: el pasajero escucha cambios de status en tiempo real
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.trips;
  EXCEPTION WHEN others THEN NULL; END;

  -- drivers: la passenger-app puede suscribir current_lat/lng del conductor
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.drivers;
  EXCEPTION WHEN others THEN NULL; END;

  -- driver_locations: ubicación dedicada en tiempo real
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_locations;
  EXCEPTION WHEN others THEN NULL; END;
END $$;


-- ============================================================
-- ============================================================
-- 7. OTP LOGIN APP PASAJEROS (requerido para login por WhatsApp)
--    Ver también: passenger_otp_auth.sql
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


-- ============================================================
-- 8. PUSH TOKENS DE PASAJEROS (notificaciones iOS/Android)
--    Ver también: passenger_devices.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.passenger_devices (
  phone       TEXT        PRIMARY KEY,
  push_token  TEXT        NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_passenger_devices_updated
  ON public.passenger_devices (updated_at DESC);

ALTER TABLE public.passenger_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "passenger_upsert_device" ON public.passenger_devices;
CREATE POLICY "passenger_upsert_device"
  ON public.passenger_devices
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);


-- VERIFICACIÓN (copiar y ejecutar por separado)
-- ============================================================
/*
-- Políticas actuales sobre las tablas que usa la passenger-app:
SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename  IN ('trips', 'drivers', 'driver_locations')
ORDER BY tablename, cmd, policyname;

-- Columnas actuales de trips:
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'trips'
ORDER BY ordinal_position;

-- Tablas en la publicación Realtime:
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
*/
