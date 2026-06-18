import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const WASENDER_API_KEY = process.env.WASENDER_API_KEY || '';
const WASENDER_BASE_URL = process.env.WASENDER_BASE_URL || 'https://www.wasenderapi.com/api';

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('Missing Supabase env vars');
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

async function getDriverForUser(supabase, userId) {
  const { data, error } = await supabase
    .from('drivers')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.id || null;
}

async function claimCompletionSummarySend(supabase, tripId, driverId) {
  const { data, error } = await supabase
    .from('trips')
    .update({ completion_summary_sent_at: new Date().toISOString() })
    .eq('id', tripId)
    .eq('driver_id', driverId)
    .eq('status', 'completed')
    .is('completion_summary_sent_at', null)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  return !!data?.id;
}

export async function POST(request) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!jwt) {
      return NextResponse.json({ ok: false, error: 'No autenticado' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const { data: userData, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !userData?.user) {
      return NextResponse.json({ ok: false, error: 'Token inválido' }, { status: 401 });
    }

    const driverId = await getDriverForUser(supabase, userData.user.id);
    if (!driverId) {
      return NextResponse.json({ ok: false, error: 'Conductor no encontrado' }, { status: 403 });
    }

    const body = await request.json();
    const rawPhone = String(body?.phone || '').trim();
    const message = String(body?.message || '').trim();
    const tripId = String(body?.tripId || body?.trip_id || '').trim();

    if (!rawPhone || !message) {
      return NextResponse.json({ ok: false, error: 'phone y message son requeridos' }, { status: 400 });
    }

    if (!tripId) {
      return NextResponse.json({ ok: false, error: 'tripId es requerido' }, { status: 400 });
    }

    const phone = normalizePhone(rawPhone);
    if (phone.length < 10) {
      return NextResponse.json({ ok: false, error: 'Número de teléfono inválido' }, { status: 400 });
    }

    const claimed = await claimCompletionSummarySend(supabase, tripId, driverId);
    if (!claimed) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'already_sent' });
    }

    if (!WASENDER_API_KEY) {
      return NextResponse.json({ ok: false, error: 'WaSender no configurado' }, { status: 503 });
    }

    const to = `${phone}@s.whatsapp.net`;
    const resp = await fetch(`${WASENDER_BASE_URL}/send-message`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WASENDER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to, text: message }),
    });

    if (!resp.ok) {
      await supabase
        .from('trips')
        .update({ completion_summary_sent_at: null })
        .eq('id', tripId)
        .eq('driver_id', driverId);

      const errBody = await resp.text();
      return NextResponse.json(
        { ok: false, error: `WaSender error: ${errBody.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const payload = await resp.json();
    return NextResponse.json({ ok: true, msgId: payload?.data?.msgId || null });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Error interno' },
      { status: 500 }
    );
  }
}
