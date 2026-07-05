-- =====================================================
-- MIGRACIÓN: commission_debt_since_at en drivers
-- Registra cuándo empezó a acumularse la deuda de comisión.
-- Ejecutar en Supabase Dashboard → SQL Editor
-- =====================================================

-- 1. Agregar columna
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS commission_debt_since_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.drivers.commission_debt_since_at IS
  'Momento en que pending_commission pasó de 0 a >0. NULL si el saldo es 0. '
  'Usar para calcular vencimiento (> 3 días sin pagar = bloqueado).';

-- 2. Actualizar el trigger de acumulación para setear commission_debt_since_at
--    cuando la deuda comienza (pending_commission pasa de 0 a >0).
CREATE OR REPLACE FUNCTION accumulate_trip_commission()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    IF NEW.commission_amount > 0 AND NEW.driver_id IS NOT NULL THEN
      BEGIN
        UPDATE drivers
        SET
          pending_commission    = pending_commission + NEW.commission_amount,
          commission_debt_since_at = CASE
            WHEN pending_commission = 0 THEN NOW()   -- primera deuda
            ELSE commission_debt_since_at             -- mantener fecha original
          END,
          updated_at = NOW()
        WHERE id = NEW.driver_id;

        INSERT INTO commission_accumulation_log (driver_id, trip_id, commission_amount, status)
        VALUES (NEW.driver_id, NEW.id, NEW.commission_amount, 'pending');
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'accumulate_trip_commission failed for trip %: %', NEW.id, SQLERRM;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Backfill: choferes con deuda activa reciben fecha = NOW()
--    (les da una ventana fresca de 3 días; es la opción más justa)
UPDATE public.drivers
SET commission_debt_since_at = NOW()
WHERE pending_commission > 0
  AND commission_debt_since_at IS NULL;

-- 4. Verificar
SELECT id, full_name, pending_commission, last_commission_payment_at, commission_debt_since_at
FROM public.drivers
WHERE pending_commission > 0
ORDER BY commission_debt_since_at ASC
LIMIT 20;
