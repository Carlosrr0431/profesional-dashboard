-- =====================================================
-- Dashboard: viajes en tiempo real (flota, cola, programados)
-- Ejecutar TODO este archivo en el SQL Editor de Supabase.
--
-- Síntoma: al cancelar un viaje (p.ej. tomado en calle) el panel
-- tarda en bajar de "1 viaje" a "0". Cola y programados también
-- esperan el poll HTTP.
--
-- Causa: el operador entra con JWT `authenticated`. El SELECT de
-- trips para ese rol solo cubre choferes (driver_id = get_my_driver_id()).
-- Realtime con RLS filtra el UPDATE de cancelación → el dashboard
-- nunca recibe el evento y espera el poll (hasta 45s en viajes/cola).
--
-- Este SQL no toca despacho, triggers ni políticas de choferes.
-- =====================================================

DO $$
BEGIN
  IF to_regprocedure('public.get_my_driver_id()') IS NULL THEN
    RAISE EXCEPTION
      'Falta public.get_my_driver_id(). Ejecutar primero driver-app/supabase/fix_drivers_rls_recursion.sql';
  END IF;
END $$;

-- ══════════════════════════════════════════════════
-- 1. Publicar trips en supabase_realtime
-- ══════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'trips'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.trips;
  END IF;
END $$;

-- UPDATE/DELETE con RLS: hace falta la fila completa (old + new)
-- para que el operador reciba cancelaciones.
ALTER TABLE public.trips REPLICA IDENTITY FULL;

-- ══════════════════════════════════════════════════
-- 2. SELECT para operadores autenticados (no choferes)
--    Los choferes siguen viendo solo los suyos.
-- ══════════════════════════════════════════════════
DROP POLICY IF EXISTS "Operadores autenticados leen viajes" ON public.trips;
CREATE POLICY "Operadores autenticados leen viajes"
  ON public.trips
  FOR SELECT
  TO authenticated
  USING (
    public.get_my_driver_id() IS NULL
    OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
    OR COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'admin'
  );

-- ══════════════════════════════════════════════════
-- 3. Cola: whatsapp_conversations (refetch del panel)
-- ══════════════════════════════════════════════════
DO $$
BEGIN
  IF to_regclass('public.whatsapp_conversations') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'whatsapp_conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_conversations;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.whatsapp_conversations') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.whatsapp_conversations REPLICA IDENTITY FULL;
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL;
END $$;

DO $$
BEGIN
  IF to_regclass('public.whatsapp_conversations') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS "Operadores autenticados leen conversaciones" ON public.whatsapp_conversations';
  EXECUTE $policy$
    CREATE POLICY "Operadores autenticados leen conversaciones"
      ON public.whatsapp_conversations
      FOR SELECT
      TO authenticated
      USING (
        public.get_my_driver_id() IS NULL
        OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
        OR COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'admin'
      )
  $policy$;
END $$;

-- Verificación:
-- SELECT tablename
-- FROM pg_publication_tables
-- WHERE pubname = 'supabase_realtime'
--   AND tablename IN ('trips', 'whatsapp_conversations');
--
-- SELECT policyname, roles, cmd
-- FROM pg_policies
-- WHERE tablename = 'trips'
--   AND policyname = 'Operadores autenticados leen viajes';
