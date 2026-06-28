-- Permite borrar viajes referenciados por whatsapp_conversations.last_trip_id.
-- Al eliminar el trip, la conversación conserva su historial y last_trip_id pasa a NULL.
-- Ejecutar en el editor SQL de Supabase.

ALTER TABLE public.whatsapp_conversations
  DROP CONSTRAINT IF EXISTS whatsapp_conversations_last_trip_id_fkey;

ALTER TABLE public.whatsapp_conversations
  ADD CONSTRAINT whatsapp_conversations_last_trip_id_fkey
  FOREIGN KEY (last_trip_id)
  REFERENCES public.trips(id)
  ON DELETE SET NULL;
