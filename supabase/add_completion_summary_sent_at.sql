-- Evita enviar más de un resumen de viaje por WhatsApp al completar.
-- Ejecutar manualmente en el editor SQL de Supabase.

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS completion_summary_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN trips.completion_summary_sent_at IS
  'Marca de tiempo del resumen de tarifa enviado al pasajero al finalizar el viaje.';
