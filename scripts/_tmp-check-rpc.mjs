import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    process.env[t.slice(0, i).trim()] ||= t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const c = createClient(url, anon);
const r = await c.rpc('driver_reject_pending_trip', {
  p_trip_id: '00000000-0000-0000-0000-000000000001',
  p_reason: 'x',
});
console.log('RPC_CHECK', JSON.stringify(r));
