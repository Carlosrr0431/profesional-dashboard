import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const OFFER_STATUSES = ['pending', 'accepted', 'going_to_pickup', 'in_progress'];
const TYPE_LABELS = {
  audio: 'Audio',
  ptt: 'Audio',
  image: 'Foto',
  video: 'Video',
  location: 'Ubicación',
  sticker: 'Sticker',
  document: 'Documento',
  contact: 'Contacto',
};

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('Missing Supabase env vars');
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function displayBody(row) {
  const body = String(row?.transcription || row?.content || row?.body || '').trim();
  if (body) return body;
  const type = String(row?.message_type || 'text').toLowerCase();
  return TYPE_LABELS[type] || 'Mensaje';
}

function isWhatsAppTrip(trip) {
  const notes = String(trip?.notes || '');
  if (/\[(PASSENGER_APP|DASHBOARD|STREET_HAIL)\]/i.test(notes)) return false;
  return /\[(WHATSAPP|APPROACH_ONLY)\]/i.test(notes) || /\[SCHEDULED_SOURCE\]\s*whatsapp/i.test(notes);
}

async function driverFromJwt(request) {
  const authHeader = request.headers.get('authorization') || '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!jwt) return { error: NextResponse.json({ ok: false, message: 'No autenticado' }, { status: 401 }) };
  const supabase = getSupabaseAdmin();
  const { data: userData, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !userData?.user) {
    return { error: NextResponse.json({ ok: false, message: 'Token inválido' }, { status: 401 }) };
  }
  const { data: driver, error } = await supabase
    .from('drivers')
    .select('id')
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (error) throw error;
  if (!driver?.id) {
    return { error: NextResponse.json({ ok: false, message: 'Conductor no encontrado' }, { status: 403 }) };
  }
  return { supabase, driver };
}

async function messagesForTrip(supabase, trip) {
  try {
    await supabase.rpc('attach_whatsapp_thread_to_trip', {
      p_trip_id: trip.id,
      p_conversation_id: null,
    });
  } catch {
    // La función puede no estar aplicada. El fallback lee el hilo directo.
  }

  const copied = await supabase
    .from('trip_whatsapp_messages')
    .select('id, trip_id, direction, message_type, body, created_at, whatsapp_message_id')
    .eq('trip_id', trip.id)
    .order('created_at', { ascending: true })
    .limit(80);
  if (!copied.error && copied.data?.length) return copied.data;

  const phone = String(trip.passenger_phone || '').trim();
  let conversationId = null;
  const byTrip = await supabase
    .from('whatsapp_conversations')
    .select('id')
    .eq('last_trip_id', trip.id)
    .maybeSingle();
  conversationId = byTrip.data?.id || null;
  if (!conversationId && phone) {
    const byPhone = await supabase
      .from('whatsapp_conversations')
      .select('id')
      .eq('phone', phone)
      .maybeSingle();
    conversationId = byPhone.data?.id || null;
  }
  if (!conversationId) return [];

  const createdMs = new Date(trip.created_at || Date.now()).getTime();
  let sinceMs = (Number.isFinite(createdMs) ? createdMs : Date.now()) - 20 * 60 * 1000;
  if (phone) {
    const prev = await supabase
      .from('trips')
      .select('completed_at, updated_at, created_at')
      .eq('passenger_phone', phone)
      .in('status', ['completed', 'cancelled'])
      .neq('id', trip.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const prevEnded = new Date(prev.data?.completed_at || prev.data?.updated_at || prev.data?.created_at || 0).getTime();
    if (Number.isFinite(prevEnded) && prevEnded >= sinceMs) sinceMs = prevEnded + 1000;
  }

  const rows = await supabase
    .from('whatsapp_messages')
    .select('id, direction, message_type, content, transcription, created_at')
    .eq('conversation_id', conversationId)
    .gte('created_at', new Date(sinceMs).toISOString())
    .order('created_at', { ascending: true })
    .limit(60);
  if (rows.error) return [];

  return (rows.data || []).map((row) => ({
    id: row.id,
    trip_id: trip.id,
    whatsapp_message_id: row.id,
    direction: row.direction,
    message_type: row.message_type || 'text',
    body: displayBody(row),
    created_at: row.created_at,
  }));
}

export async function GET(request) {
  try {
    const auth = await driverFromJwt(request);
    if (auth.error) return auth.error;
    const tripId = new URL(request.url).searchParams.get('tripId') || '';
    if (!tripId) {
      return NextResponse.json({ ok: false, message: 'Falta el viaje' }, { status: 400 });
    }

    const { data: trip, error } = await auth.supabase
      .from('trips')
      .select('id, driver_id, status, notes, passenger_phone, created_at')
      .eq('id', tripId)
      .maybeSingle();
    if (error) throw error;
    if (!trip || trip.driver_id !== auth.driver.id) {
      return NextResponse.json({ ok: false, message: 'Viaje no asignado' }, { status: 403 });
    }
    if (!OFFER_STATUSES.includes(String(trip.status || '').toLowerCase()) || !isWhatsAppTrip(trip)) {
      return NextResponse.json({ ok: true, messages: [] });
    }

    const messages = await messagesForTrip(auth.supabase, trip);
    return NextResponse.json({ ok: true, messages });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err?.message || 'No se pudo leer el WhatsApp' },
      { status: 500 },
    );
  }
}
