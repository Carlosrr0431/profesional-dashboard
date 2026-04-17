CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL UNIQUE,
  push_name TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'awaiting_info', 'awaiting_driver', 'trip_created', 'paused')),
  is_collecting BOOLEAN NOT NULL DEFAULT FALSE,
  pending_messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  accumulation_started_at TIMESTAMPTZ,
  processing_started_at TIMESTAMPTZ,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_trip_id UUID REFERENCES trips(id),
  last_incoming_at TIMESTAMPTZ,
  last_processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  external_message_id TEXT NOT NULL UNIQUE,
  direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  message_type TEXT NOT NULL DEFAULT 'text',
  content TEXT,
  media_url TEXT,
  transcription TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_collecting
  ON whatsapp_conversations(is_collecting, accumulation_started_at);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation
  ON whatsapp_messages(conversation_id, created_at DESC);

CREATE OR REPLACE FUNCTION append_whatsapp_message(
  p_phone TEXT,
  p_push_name TEXT,
  p_external_message_id TEXT,
  p_direction TEXT,
  p_message_type TEXT,
  p_content TEXT,
  p_media_url TEXT,
  p_transcription TEXT,
  p_raw_payload JSONB
) RETURNS TABLE (
  conversation_id UUID,
  inserted BOOLEAN
) LANGUAGE plpgsql AS $$
DECLARE
  v_conversation_id UUID;
  v_inserted_id UUID;
  v_buffer_item JSONB;
BEGIN
  INSERT INTO whatsapp_conversations (phone, push_name, updated_at)
  VALUES (regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g'), p_push_name, NOW())
  ON CONFLICT (phone)
  DO UPDATE SET
    push_name = COALESCE(EXCLUDED.push_name, whatsapp_conversations.push_name),
    updated_at = NOW()
  RETURNING id INTO v_conversation_id;

  INSERT INTO whatsapp_messages (
    conversation_id,
    external_message_id,
    direction,
    message_type,
    content,
    media_url,
    transcription,
    raw_payload
  ) VALUES (
    v_conversation_id,
    p_external_message_id,
    p_direction,
    COALESCE(p_message_type, 'text'),
    p_content,
    p_media_url,
    p_transcription,
    p_raw_payload
  )
  ON CONFLICT (external_message_id) DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN
    RETURN QUERY SELECT v_conversation_id, FALSE;
    RETURN;
  END IF;

  IF p_direction = 'incoming' THEN
    v_buffer_item := jsonb_build_object(
      'messageId', p_external_message_id,
      'tipo', COALESCE(p_message_type, 'text'),
      'contenido', COALESCE(NULLIF(p_transcription, ''), NULLIF(p_content, ''), '[' || COALESCE(p_message_type, 'text') || ']'),
      'timestamp', NOW()
    );

    UPDATE whatsapp_conversations
    SET
      push_name = COALESCE(p_push_name, push_name),
      is_collecting = TRUE,
      pending_messages = COALESCE(pending_messages, '[]'::jsonb) || jsonb_build_array(v_buffer_item),
      accumulation_started_at = NOW(),
      processing_started_at = NULL,
      last_incoming_at = NOW(),
      updated_at = NOW()
    WHERE id = v_conversation_id;
  END IF;

  RETURN QUERY SELECT v_conversation_id, TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION claim_whatsapp_conversation_batch(
  p_conversation_id UUID
) RETURNS TABLE (
  id UUID,
  phone TEXT,
  push_name TEXT,
  context JSONB,
  pending_messages JSONB,
  status TEXT,
  last_trip_id UUID
) LANGUAGE plpgsql AS $$
DECLARE
  v_row whatsapp_conversations%ROWTYPE;
BEGIN
  SELECT *
  INTO v_row
  FROM whatsapp_conversations
  WHERE whatsapp_conversations.id = p_conversation_id
    AND is_collecting = TRUE
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE whatsapp_conversations
  SET
    is_collecting = FALSE,
    accumulation_started_at = NULL,
    processing_started_at = NOW(),
    pending_messages = '[]'::jsonb,
    updated_at = NOW()
  WHERE whatsapp_conversations.id = p_conversation_id;

  RETURN QUERY
  SELECT
    v_row.id,
    v_row.phone,
    v_row.push_name,
    COALESCE(v_row.context, '{}'::jsonb),
    COALESCE(v_row.pending_messages, '[]'::jsonb),
    v_row.status,
    v_row.last_trip_id;
END;
$$;

ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Dashboard can manage whatsapp conversations" ON whatsapp_conversations;
CREATE POLICY "Dashboard can manage whatsapp conversations"
  ON whatsapp_conversations
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Dashboard can manage whatsapp messages" ON whatsapp_messages;
CREATE POLICY "Dashboard can manage whatsapp messages"
  ON whatsapp_messages
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

INSERT INTO settings (key, value, updated_at)
VALUES
  ('whatsapp_amt_fare', '0', NOW()),
  ('whatsapp_driver_commission', '0', NOW())
ON CONFLICT (key) DO NOTHING;