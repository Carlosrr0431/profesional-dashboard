-- =====================================================
-- MIGRACIÓN: Metadatos de pagos de comisión (Paypertic + manual)
-- Ejecutar en Supabase Dashboard → SQL Editor
-- =====================================================

ALTER TABLE commission_payments
  ADD COLUMN IF NOT EXISTS payment_source TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS paypertic_id TEXT,
  ADD COLUMN IF NOT EXISTS external_transaction_id TEXT;

COMMENT ON COLUMN commission_payments.payment_source IS 'Origen: paypertic | manual | dashboard';
COMMENT ON COLUMN commission_payments.paypertic_id IS 'ID del pago en Paypertic (idempotencia)';
COMMENT ON COLUMN commission_payments.external_transaction_id IS 'external_transaction_id enviado a Paypertic';

CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_payments_paypertic_id
  ON commission_payments (paypertic_id)
  WHERE paypertic_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_commission_payments_source
  ON commission_payments (payment_source);

-- Backfill: pagos existentes vía Paypertic (detectados por notas)
UPDATE commission_payments
SET payment_source = 'paypertic',
    paypertic_id = substring(notes from 'ID: ([^\\s]+)$')
WHERE payment_source IS DISTINCT FROM 'paypertic'
  AND notes ILIKE '%Paypertic%'
  AND paypertic_id IS NULL;
