-- Agrega el status 'awaiting_address_selection' al check constraint de whatsapp_conversations.
-- Este status se usa cuando se envía un poll de desambiguación de dirección al pasajero.

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
      'paused'
    ));
