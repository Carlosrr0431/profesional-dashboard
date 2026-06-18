-- ============================================================
-- Tabla: passenger_devices
-- Almacena el push token FCM de cada pasajero (por teléfono).
-- El servidor (dashboard) la consulta para enviar notificaciones
-- push cuando el estado del viaje cambia mientras la app está
-- cerrada o en background.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.passenger_devices (
  phone       TEXT        PRIMARY KEY,
  push_token  TEXT        NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_passenger_devices_updated
  ON public.passenger_devices (updated_at DESC);

-- RLS
ALTER TABLE public.passenger_devices ENABLE ROW LEVEL SECURITY;

-- La passenger-app (anon) puede insertar/actualizar su propio token
CREATE POLICY "passenger_upsert_device"
  ON public.passenger_devices
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.passenger_devices TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.passenger_devices TO authenticated;

-- El dashboard/servidor puede leer todos los tokens para enviar FCM
-- (usa service_role → bypass RLS, no necesita política explícita)

-- Realtime no es necesario en esta tabla (es solo escritura del cliente)

-- ============================================================
-- CÓMO USA ESTA TABLA EL SISTEMA
-- ============================================================
-- 1. Pasajero abre la app → registerForPushNotifications(phone)
--    → UPSERT en passenger_devices { phone, push_token }
--
-- 2. Cuando el estado del viaje cambia (aceptado, en camino, etc.),
--    el servidor lee passenger_devices WHERE phone = trip.passenger_phone
--    y envía un FCM con el push_token guardado.
--
-- 3. La app recibe el FCM via messaging().setBackgroundMessageHandler
--    (implementado en App.js) y muestra la notificación local.
-- ============================================================
