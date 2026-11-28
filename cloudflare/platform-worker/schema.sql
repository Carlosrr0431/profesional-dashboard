CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY,
  status TEXT,
  driver_id TEXT,
  passenger_name TEXT,
  passenger_phone TEXT,
  origin_address TEXT,
  origin_lat REAL,
  origin_lng REAL,
  destination_address TEXT,
  destination_lat REAL,
  destination_lng REAL,
  notes TEXT,
  dispatch_status TEXT,
  next_after_trip_id TEXT,
  price REAL,
  created_at TEXT,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_trips_status ON trips (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS drivers (
  id TEXT PRIMARY KEY,
  full_name TEXT,
  phone TEXT,
  is_online INTEGER,
  is_available INTEGER,
  current_lat REAL,
  current_lng REAL,
  driver_number INTEGER,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id TEXT PRIMARY KEY,
  phone TEXT,
  status TEXT,
  last_message TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT,
  direction TEXT,
  body TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS dispatch_queue (
  trip_id TEXT PRIMARY KEY,
  queue_status TEXT,
  next_attempt_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS cf_failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  area TEXT NOT NULL,
  operation TEXT NOT NULL,
  message TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cf_failures_created ON cf_failures (created_at DESC);

CREATE TABLE IF NOT EXISTS cf_job_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job TEXT NOT NULL,
  ok INTEGER NOT NULL,
  message TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cf_job_runs_created ON cf_job_runs (created_at DESC);
