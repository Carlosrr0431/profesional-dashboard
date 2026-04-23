-- Agrega el status 'queued_no_driver' al check constraint de whatsapp_conversations.
-- Este status se usa cuando no hay conductores disponibles y el pasajero queda en cola.

ALTER TABLE whatsapp_conversations
  DROP CONSTRAINT IF EXISTS whatsapp_conversations_status_check;

ALTER TABLE whatsapp_conversations
  ADD CONSTRAINT whatsapp_conversations_status_check
    CHECK (status IN (
      'open',
      'awaiting_info',
      'awaiting_driver',
      'trip_created',
      'awaiting_address_selection',
      'queued_no_driver',
      'paused'
    ));
