-- ============================================================
-- passenger_auth_sessions: agregar push_token + unicidad por phone
--
-- Contexto:
--   La tabla ya existe con columnas: id, phone, token, expires_at.
--   La necesitamos también como fuente de verdad del push token FCM
--   del pasajero (antes disperso en passenger_devices).
--
-- Ejecutar en el editor SQL de Supabase (orden importa).
-- ============================================================


-- 1. Agregar columnas nuevas (idempotente)
ALTER TABLE passenger_auth_sessions
  ADD COLUMN IF NOT EXISTS push_token  TEXT,
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ DEFAULT NOW();


-- 2. Eliminar filas duplicadas por phone antes de agregar el UNIQUE
--    (mantiene la sesión más reciente por phone, según expires_at)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY phone
           ORDER BY COALESCE(expires_at, '1970-01-01'::timestamptz) DESC,
                    id DESC
         ) AS rn
  FROM passenger_auth_sessions
)
DELETE FROM passenger_auth_sessions
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);


-- 3. Restricción única por phone (un registro activo por pasajero)
ALTER TABLE passenger_auth_sessions
  DROP CONSTRAINT IF EXISTS uq_passenger_auth_sessions_phone,
  ADD  CONSTRAINT uq_passenger_auth_sessions_phone UNIQUE (phone);


-- 4. Índices de acceso rápido
CREATE INDEX IF NOT EXISTS idx_pas_push_token
  ON passenger_auth_sessions(push_token)
  WHERE push_token IS NOT NULL;

-- (El índice en "phone" ya lo cubre el UNIQUE de arriba)
-- (El índice en "token" ya debería existir; lo creamos por si acaso)
CREATE INDEX IF NOT EXISTS idx_pas_token
  ON passenger_auth_sessions(token)
  WHERE token IS NOT NULL;


-- 5. Trigger: actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION fn_passenger_auth_sessions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_passenger_auth_sessions_updated_at ON passenger_auth_sessions;
CREATE TRIGGER trg_passenger_auth_sessions_updated_at
  BEFORE UPDATE ON passenger_auth_sessions
  FOR EACH ROW EXECUTE FUNCTION fn_passenger_auth_sessions_updated_at();


-- 6. Política RLS (service role ya tiene acceso implícito;
--    estas policies permiten que la passenger-app anon pueda operar)
ALTER TABLE passenger_auth_sessions ENABLE ROW LEVEL SECURITY;

-- Anon puede insertar su propia sesión (registro OTP)
DROP POLICY IF EXISTS "anon_insert_session"  ON passenger_auth_sessions;
CREATE POLICY "anon_insert_session" ON passenger_auth_sessions
  FOR INSERT TO anon WITH CHECK (true);

-- Anon puede actualizar (renovar token o push_token)
DROP POLICY IF EXISTS "anon_update_session" ON passenger_auth_sessions;
CREATE POLICY "anon_update_session" ON passenger_auth_sessions
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Anon NO puede leer filas (protege sesiones ajenas; la lectura va por service role)
DROP POLICY IF EXISTS "anon_no_select" ON passenger_auth_sessions;
-- (sin CREATE POLICY SELECT → anon no ve nada)
