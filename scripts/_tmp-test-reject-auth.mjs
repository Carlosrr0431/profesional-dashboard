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
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const svc = createClient(url, service, { auth: { persistSession: false } });
const client = createClient(url, anon, { auth: { persistSession: false } });

async function testDriver(email) {
  const { data: signIn, error } = await client.auth.signInWithPassword({ email, password: '123456' });
  if (error) return console.log(email, 'SIGNIN_FAIL', error.message);
  const { data: driver } = await client.from('drivers').select('id').eq('user_id', signIn.user.id).single();
  const { data: trip } = await svc.from('trips').insert({
    driver_id: driver.id,
    passenger_name: 'Test',
    passenger_phone: '5493878000001',
    origin_address: 'Test',
    origin_lat: -24.78,
    origin_lng: -65.42,
    destination_address: 'Av. Belgrano 1200',
    destination_lat: -24.79,
    destination_lng: -65.41,
    status: 'pending',
    assigned_at: new Date().toISOString(),
    dispatch_status: 'waiting_acceptance',
    notes: '[APPROACH_ONLY] test',
  }).select('id').single();

  const { data: rpcData, error: rpcErr } = await client.rpc('driver_reject_pending_trip', {
    p_trip_id: trip.id,
    p_reason: 'Lejanía',
  });
  console.log(email, 'RPC', rpcErr?.message || JSON.stringify(rpcData));

  const pending = await svc.from('trips').insert({
    driver_id: driver.id,
    passenger_name: 'Test2',
    passenger_phone: '5493878000002',
    origin_address: 'Test',
    origin_lat: -24.78,
    origin_lng: -65.42,
    destination_address: 'Av. Belgrano 1200',
    destination_lat: -24.79,
    destination_lng: -65.41,
    status: 'pending',
    assigned_at: new Date().toISOString(),
    dispatch_status: 'waiting_acceptance',
    notes: '[APPROACH_ONLY] test',
  }).select('id').single();

  const token = signIn.session.access_token;
  for (const [label, endpoint, body] of [
    ['reject-trip', 'https://profesional-dashboard.vercel.app/api/driver/reject-trip', { tripId: pending.data.id, reason: 'Lejanía' }],
    ['Agente_IA', 'https://profesional-dashboard.vercel.app/api/Agente_IA', { event: 'trip.driver_reject', tripId: pending.data.id, reason: 'Lejanía' }],
  ]) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    console.log(email, label, response.status, JSON.stringify(payload));
  }

  await svc.from('trips').delete().in('id', [trip.id, pending.data.id]);
  await client.auth.signOut();
}

await testDriver('test@remises.com');
await testDriver('carlos.driver@profesional.test');
