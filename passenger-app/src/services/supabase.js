import { createClient, processLock } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://xzabzbrolmkezljsyycr.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || 'sb_publishable_7NIfu3DWpS_73AyUfJIpmQ_O3yG38wq';

const createSupabase = () =>
  createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      lock: processLock,
    },
    realtime: { params: { eventsPerSecond: 10 } },
  });

if (!globalThis.__passengerAppSupabaseClient) {
  globalThis.__passengerAppSupabaseClient = createSupabase();
}

export const supabase = globalThis.__passengerAppSupabaseClient;

// Sincronizar autoRefresh con ciclo de vida de la app
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
