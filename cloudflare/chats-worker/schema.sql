CREATE TABLE IF NOT EXISTS wa_chats (
  id TEXT PRIMARY KEY,
  line_phone TEXT NOT NULL,
  peer_phone TEXT NOT NULL,
  peer_name TEXT,
  saved_name TEXT,
  last_body TEXT,
  last_type TEXT,
  last_direction TEXT,
  last_at INTEGER NOT NULL,
  unread INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_wa_chats_line_last ON wa_chats (line_phone, last_at DESC);

CREATE TABLE IF NOT EXISTS wa_messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  line_phone TEXT NOT NULL,
  peer_phone TEXT NOT NULL,
  direction TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  body TEXT,
  sent_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wa_messages_chat_sent ON wa_messages (chat_id, sent_at ASC);
