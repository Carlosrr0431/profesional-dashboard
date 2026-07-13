-- =====================================================
-- FIX: Dashboard autenticado no puede INSERT en trips
--
-- Síntoma: "new row violates row-level security policy for table 'trips'"
-- al asignar viaje desde el panel (sesión authenticated).
--
-- Causa: las políticas permiten INSERT solo a rol `anon`.
-- El operador logueado usa JWT → rol `authenticated` → 403.
--
-- Aplicar en el SQL Editor de Supabase.
-- =====================================================

DROP POLICY IF EXISTS "Operadores autenticados insertan viajes" ON public.trips;
CREATE POLICY "Operadores autenticados insertan viajes"
  ON public.trips
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- (Opcional) si también fallan updates de cancelación/requeue desde el panel:
DROP POLICY IF EXISTS "Operadores autenticados actualizan viajes" ON public.trips;
CREATE POLICY "Operadores autenticados actualizan viajes"
  ON public.trips
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
