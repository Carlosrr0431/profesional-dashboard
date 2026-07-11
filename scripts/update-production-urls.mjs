import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

function readEnv(path) {
  const out = {};
  if (!fs.existsSync(path)) return out;
  for (const line of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    out[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}

function updateLocalEnvFiles() {
  for (const file of ['.env', '.env.local']) {
    if (!fs.existsSync(file)) continue;
    let text = fs.readFileSync(file, 'utf8');
    const before = text;
    text = text.replaceAll(
      'https://profesional-dashboard.vercel.app',
      'https://www.profesionalviajes.com.ar',
    );
    if (!/^TRACKING_BASE_URL=/m.test(text)) {
      text = text.replace(
        /^(NEXT_PUBLIC_APP_URL=.*)$/m,
        '$1\nTRACKING_BASE_URL=https://www.profesionalviajes.com.ar',
      );
    } else {
      text = text.replace(
        /^TRACKING_BASE_URL=.*$/m,
        'TRACKING_BASE_URL=https://www.profesionalviajes.com.ar',
      );
    }
    text = text.replace(
      /^NEXT_PUBLIC_APP_URL=.*$/m,
      'NEXT_PUBLIC_APP_URL=https://www.profesionalviajes.com.ar',
    );
    if (text !== before) {
      fs.writeFileSync(file, text);
      console.log('updated local env', file);
    } else {
      console.log('unchanged local env', file);
    }
  }
}

async function updateSupabaseSettings() {
  const env = { ...readEnv('.env'), ...readEnv('.env.local') };
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('missing supabase credentials');
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const updates = [
    ['dispatch_worker_url', 'https://www.profesionalviajes.com.ar/api/dispatch-worker'],
    ['whatsapp_trip_transition_url', 'https://www.profesionalviajes.com.ar/api/Agente_IA'],
  ];

  for (const [keyName, value] of updates) {
    const { error } = await supabase
      .from('settings')
      .upsert({ key: keyName, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) throw new Error(`${keyName}: ${error.message}`);
    console.log('ok', keyName, value);
  }

  const { data, error } = await supabase
    .from('settings')
    .select('key,value')
    .in('key', updates.map(([k]) => k));
  if (error) throw error;
  console.log(JSON.stringify(data, null, 2));
}

updateLocalEnvFiles();
await updateSupabaseSettings();
