'use client';

import { createClient } from '@supabase/supabase-js';

let client = null;

export function getDriverSupabase() {
  if (typeof window === 'undefined') return null;
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  client = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'profesional-conductor-web',
    },
    realtime: { params: { eventsPerSecond: 20 } },
  });
  return client;
}
