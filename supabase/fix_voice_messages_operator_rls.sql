-- =====================================================
-- FIX: operadores del dashboard pueden enviar voice_messages
--
-- Con sesión authenticated, la RLS solo permitía
--   driver_id = get_my_driver_id()
-- Los admins no son choferes → INSERT falla.
--
-- El dashboard ya inserta vía /api/voice-messages (service role).
-- Este SQL es respaldo opcional si se vuelve a insertar desde el cliente.
--
-- Ejecutar en el SQL Editor de Supabase si hace falta.
-- =====================================================

DROP POLICY IF EXISTS "Operadores envian mensajes de voz" ON public.voice_messages;
DROP POLICY IF EXISTS "Operadores leen mensajes de voz" ON public.voice_messages;
DROP POLICY IF EXISTS "Operadores actualizan mensajes de voz" ON public.voice_messages;

-- Operador = authenticated sin fila de chofer vinculada
CREATE POLICY "Operadores envian mensajes de voz"
  ON public.voice_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_type = 'base'
    AND public.get_my_driver_id() IS NULL
  );

CREATE POLICY "Operadores leen mensajes de voz"
  ON public.voice_messages
  FOR SELECT
  TO authenticated
  USING (
    public.get_my_driver_id() IS NULL
    OR driver_id = public.get_my_driver_id()
  );

CREATE POLICY "Operadores actualizan mensajes de voz"
  ON public.voice_messages
  FOR UPDATE
  TO authenticated
  USING (
    public.get_my_driver_id() IS NULL
    OR driver_id = public.get_my_driver_id()
  );
