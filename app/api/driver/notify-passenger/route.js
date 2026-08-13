import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendWhatsmeowText, getWhatsmeowApiKey } from '../../../../src/lib/whatsmeowClient';
import { resolveWhatsmeowLineForPassenger } from '../../../../src/lib/whatsmeowLines';

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
  return data;
}

async function claimCompletionSummarySend(supabase, tripId, driverId) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('trips')
    .update({ completion_summary_sent_at: now })
    .eq('id', tripId)
    .eq('driver_id', driverId)
    .is('completion_summary_sent_at', null)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

export async function POST(request) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData?.user) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
    }

    const driver = await getDriverForUser(supabase, authData.user.id);
    if (!driver?.id) {
      return NextResponse.json({ ok: false, error: 'Chofer no encontrado' }, { status: 403 });
    }
    const driverId = driver.id;

    const body = await request.json().catch(() => ({}));
    const rawPhone = body?.phone || body?.passengerPhone || '';
    const message = String(body?.message || '').trim();
    const tripId = String(body?.tripId || '').trim();

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

    const { data: tripRow } = await supabase
      .from('trips')
      .select('id, wa_context, passenger_phone')
      .eq('id', tripId)
      .maybeSingle();

    const line = await resolveWhatsmeowLineForPassenger(supabase, {
      passengerPhone: tripRow?.passenger_phone || phone,
      tripWaContext: tripRow?.wa_context,
    });
    const apiKey = getWhatsmeowApiKey();
    if (!apiKey || !line?.agentCode) {
      return NextResponse.json({ ok: false, error: 'WhatsApp (whatsmeow) no configurado' }, { status: 503 });
    }

    // Esperar entrega real: si solo encoláramos, completion_summary_sent_at
    // quedaría marcado aunque el envío falle después.
    const result = await sendWhatsmeowText(line.agentCode, phone, message, {
      apiKey,
      awaitDelivery: true,
      meta: { source: 'notify_passenger', tripId },
    });
    if (!result.success) {
      await supabase
        .from('trips')
        .update({ completion_summary_sent_at: null })
        .eq('id', tripId)
        .eq('driver_id', driverId);

      return NextResponse.json(
        { ok: false, error: `WhatsApp error: ${String(result.error || '').slice(0, 200)}` },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, msgId: result.messageId || null });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Error interno' },
      { status: 500 }
    );
  }
}
