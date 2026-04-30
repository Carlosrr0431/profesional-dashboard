-- Simplificación: cola de espera gestionada desde tabla trips
-- Elimina dependencia de whatsapp_conversations.status='queued_no_driver'
-- y agrega rastreo de notificaciones al pasajero.
--
-- EJECUTAR en el editor SQL de Supabase antes de deployar el nuevo route.js

-- 1. Columna para rastrear cuándo se notificó al pasajero del viaje activo.
--    También marca viajes cancelados como "ya procesados por el cron".
ALTER TABLE trips ADD COLUMN IF NOT EXISTS wa_notified_at TIMESTAMPTZ;

-- 2. Marcar todos los viajes existentes como ya procesados
--    para que el cron no intente notificar pasajeros de viajes viejos al arrancar.
UPDATE trips SET wa_notified_at = NOW() WHERE wa_notified_at IS NULL;

-- 3. Permitir driver_id nulo (viajes en cola aún no tienen chofer asignado)
ALTER TABLE trips ALTER COLUMN driver_id DROP NOT NULL;

-- 4. Permitir campos de origen nulos (viajes en cola no tienen posición de chofer aún)
ALTER TABLE trips ALTER COLUMN origin_address DROP NOT NULL;
ALTER TABLE trips ALTER COLUMN origin_lat DROP NOT NULL;
ALTER TABLE trips ALTER COLUMN origin_lng DROP NOT NULL;

-- Verificar resultado:
-- SELECT column_name, is_nullable FROM information_schema.columns
-- WHERE table_name = 'trips' ORDER BY ordinal_position;
