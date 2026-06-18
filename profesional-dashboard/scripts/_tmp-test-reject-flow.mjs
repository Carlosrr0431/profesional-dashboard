import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const root = path.dirname(fileURLToPath(import.meta.url));

function loadEnv(relativePath) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv('../.env');
loadEnv('../.env.local');

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const client = createClient(url, anon, { auth: { persistSession: false } });

const { data: signIn, error: signInErr } = await client.auth.signInWithPassword({
  email: 'test@remises.com',
  password: '123456',
});
if (signInErr) {
  console.error('SIGNIN', signInErr.message);
  process.exit(1);
}

const token = signIn.session.access_token;
const { data: driver } = await client.from('drivers').select('id').eq('user_id', signIn.user.id).single();

let { data: trip } = await svc
  .from('trips')
  .select('id, status, driver_id')
  .eq('status', 'pending')
  .eq('driver_id', driver.id)
  .maybeSingle();

if (!trip) {
  const { data: q } = await svc.from('trips').select('id').eq('status', 'queued').limit(1).maybeSingle();
  if (!q) {
    console.log('NO_TRIP');
    process.exit(0);
  }
  await svc.from('trips').update({
    status: 'pending',
    driver_id: driver.id,
    assigned_at: new Date().toISOString(),
    dispatch_status: 'waiting_acceptance',
    origin_address: 'Test',
    origin_lat: -24.78,
    origin_lng: -65.42,
  }).eq('id', q.id);
  trip = { id: q.id };
}

console.log('trip', trip.id, 'driver', driver.id);

const rpc = await client.rpc('driver_reject_pending_trip', {
  p_trip_id: trip.id,
  p_reason: 'Test RPC',
});
console.log('RPC', JSON.stringify(rpc));

await svc.from('trips').update({
  status: 'pending',
  driver_id: driver.id,
  assigned_at: new Date().toISOString(),
  dispatch_status: 'waiting_acceptance',
  origin_address: 'Test',
  origin_lat: -24.78,
  origin_lng: -65.42,
  cancel_reason: null,
}).eq('id', trip.id);

for (const [label, endpoint, body] of [
  ['reject-trip', 'https://profesional-dashboard.vercel.app/api/driver/reject-trip', { tripId: trip.id, reason: 'Test API' }],
  ['Agente_IA', 'https://profesional-dashboard.vercel.app/api/Agente_IA', { event: 'trip.driver_reject', tripId: trip.id, reason: 'Test Agente' }],
]) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  console.log(label, response.status, JSON.stringify(payload));
}
