import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validatePassengerSession } from '../../../../src/lib/passengerOtp';
import {
  isTripChatReadable,
  isTripChatWritable,
  phonesMatchTrip,
  sanitizeChatText,
  TRIP_CHAT_MAX_AUDIO_SECONDS,
} from '../../../../src/lib/tripChat';
import { notifyTripChatRecipient } from '../../../../src/lib/tripChatPush';

function notifyChatRecipientSafe(supabase, message) {
  if (!message?.id || !message?.trip_id) return;
  notifyTripChatRecipient(supabase, {
    tripId: message.trip_id,
    senderRole: message.sender_role,
    messageType: message.message_type,
    body: message.body,
    messageId: message.id,
  }).catch((err) => {
    console.warn('[trips/chat] push notify failed:', err?.message || err);
  });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function resolvePassengerTripAccess({ tripId, phone, sessionToken, requireWritable }) {
  const auth = await validatePassengerSession(phone, sessionToken);
  if (!auth.ok) {
    return {
      ok: false,
      status: auth.status || 401,
      message: auth.message || 'Sesión inválida.',
      reason: 'unauthorized',
    };
  }

  const supabase = getSupabaseAdmin();
  const { data: trip, error } = await supabase
    .from('trips')
    .select('id, status, passenger_phone, driver_id')
    .eq('id', tripId)
    .maybeSingle();

  if (error) throw error;
  if (!trip) {
    return { ok: false, status: 404, message: 'No encontramos el viaje.', reason: 'trip_not_found' };
  }

  if (!phonesMatchTrip(trip.passenger_phone, auth.phone)) {
    return { ok: false, status: 403, message: 'No tenés acceso a este chat.', reason: 'forbidden' };
  }

  if (requireWritable && !isTripChatWritable(trip.status)) {
    return {
      ok: false,
      status: 409,
      message: 'El chat solo está disponible mientras el viaje está en curso.',
      reason: 'chat_closed',
    };
  }

  if (!requireWritable && !isTripChatReadable(trip.status)) {
    return {
      ok: false,
      status: 409,
      message: 'Este viaje no tiene chat disponible.',
      reason: 'chat_unavailable',
    };
  }

  if (!trip.driver_id && requireWritable) {
    return {
      ok: false,
      status: 409,
      message: 'Todavía no hay conductor asignado para chatear.',
      reason: 'no_driver',
    };
  }

  return { ok: true, trip, phone: auth.phone, supabase };
}

/** GET: lista mensajes del viaje (pasajero autenticado por sesión). */
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const tripId = String(searchParams.get('tripId') || '').trim();
    const phone = String(searchParams.get('phone') || '').trim();
    const sessionToken = String(searchParams.get('sessionToken') || '').trim();

    if (!tripId || !phone || !sessionToken) {
      return NextResponse.json(
        { ok: false, reason: 'missing_params', message: 'Faltan datos de sesión o viaje.' },
        { status: 400 }
      );
    }

    const access = await resolvePassengerTripAccess({
      tripId,
      phone,
      sessionToken,
      requireWritable: false,
    });
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, reason: access.reason, message: access.message },
        { status: access.status }
      );
    }

    const { data: messages, error } = await access.supabase
      .from('trip_chat_messages')
      .select('id, trip_id, sender_role, message_type, body, audio_url, audio_duration_seconds, created_at, client_id')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: true })
      .limit(120);

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      messages: messages || [],
      writable: isTripChatWritable(access.trip.status),
      tripStatus: access.trip.status,
    });
  } catch (err) {
    console.error('[trips/chat GET]', err);
    return NextResponse.json(
      { ok: false, reason: 'server_error', message: err?.message || 'No se pudo cargar el chat.' },
      { status: 500 }
    );
  }
}

/** POST: envía texto (JSON) o audio (multipart). */
export async function POST(req) {
  try {
    const contentType = String(req.headers.get('content-type') || '');
    const isMultipart = contentType.includes('multipart/form-data');

    let tripId;
    let phone;
    let sessionToken;
    let messageType;
    let body;
    let clientId;
    let audioFile = null;
    let audioBase64 = null;
    let audioContentType = 'audio/mp4';
    let audioDurationSeconds = null;

    if (isMultipart) {
      const form = await req.formData();
      tripId = String(form.get('tripId') || '').trim();
      phone = String(form.get('phone') || '').trim();
      sessionToken = String(form.get('sessionToken') || '').trim();
      messageType = String(form.get('messageType') || 'audio').trim();
      clientId = String(form.get('clientId') || '').trim() || null;
      audioDurationSeconds = Number(form.get('audioDurationSeconds'));
      audioFile = form.get('audio');
      audioContentType = String(form.get('audioContentType') || audioFile?.type || 'audio/mp4');
    } else {
      const payload = await req.json().catch(() => null);
      tripId = String(payload?.tripId || '').trim();
      phone = String(payload?.phone || '').trim();
      sessionToken = String(payload?.sessionToken || '').trim();
      messageType = String(payload?.messageType || 'text').trim();
      body = payload?.body;
      clientId = String(payload?.clientId || '').trim() || null;
      audioBase64 = typeof payload?.audioBase64 === 'string' ? payload.audioBase64 : null;
      audioContentType = String(payload?.audioContentType || 'audio/mp4');
      audioDurationSeconds = Number(payload?.audioDurationSeconds);
    }

    if (!tripId || !phone || !sessionToken) {
      return NextResponse.json(
        { ok: false, reason: 'missing_params', message: 'Faltan datos de sesión o viaje.' },
        { status: 400 }
      );
    }

    const access = await resolvePassengerTripAccess({
      tripId,
      phone,
      sessionToken,
      requireWritable: true,
    });
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, reason: access.reason, message: access.message },
        { status: access.status }
      );
    }

    if (messageType === 'text') {
      const text = sanitizeChatText(body);
      if (!text) {
        return NextResponse.json(
          { ok: false, reason: 'empty_text', message: 'Escribí un mensaje.' },
          { status: 400 }
        );
      }

      const { data: message, error } = await access.supabase
        .from('trip_chat_messages')
        .insert({
          trip_id: tripId,
          sender_role: 'passenger',
          message_type: 'text',
          body: text,
          client_id: clientId,
        })
        .select('id, trip_id, sender_role, message_type, body, audio_url, audio_duration_seconds, created_at, client_id')
        .single();

      if (error) throw error;
      notifyChatRecipientSafe(access.supabase, message);
      return NextResponse.json({ ok: true, message });
    }

    if (messageType === 'audio') {
      const duration = Number.isFinite(audioDurationSeconds)
        ? Math.max(1, Math.min(TRIP_CHAT_MAX_AUDIO_SECONDS, Math.round(audioDurationSeconds)))
        : 1;

      let bytes = null;
      if (audioBase64) {
        const cleaned = audioBase64.replace(/^data:[^;]+;base64,/, '');
        bytes = Buffer.from(cleaned, 'base64');
      } else if (audioFile && typeof audioFile.arrayBuffer === 'function') {
        bytes = Buffer.from(await audioFile.arrayBuffer());
      }

      if (!bytes?.length) {
        return NextResponse.json(
          { ok: false, reason: 'missing_audio', message: 'No se recibió el audio.' },
          { status: 400 }
        );
      }
      if (bytes.length > 5 * 1024 * 1024) {
        return NextResponse.json(
          { ok: false, reason: 'invalid_audio', message: 'El audio no es válido.' },
          { status: 400 }
        );
      }

      const fileName = `passenger/${tripId}/${Date.now()}.m4a`;
      const contentTypeAudio = audioContentType || 'audio/mp4';

      const { error: uploadError } = await access.supabase.storage
        .from('trip-chat-audio')
        .upload(fileName, bytes, { contentType: contentTypeAudio, upsert: false });

      if (uploadError) throw uploadError;

      const { data: urlData } = access.supabase.storage
        .from('trip-chat-audio')
        .getPublicUrl(fileName);

      const { data: message, error } = await access.supabase
        .from('trip_chat_messages')
        .insert({
          trip_id: tripId,
          sender_role: 'passenger',
          message_type: 'audio',
          audio_url: urlData.publicUrl,
          audio_duration_seconds: duration,
          client_id: clientId,
        })
        .select('id, trip_id, sender_role, message_type, body, audio_url, audio_duration_seconds, created_at, client_id')
        .single();

      if (error) throw error;
      notifyChatRecipientSafe(access.supabase, message);
      return NextResponse.json({ ok: true, message });
    }

    return NextResponse.json(
      { ok: false, reason: 'invalid_type', message: 'Tipo de mensaje no soportado.' },
      { status: 400 }
    );
  } catch (err) {
    console.error('[trips/chat POST]', err);
    return NextResponse.json(
      { ok: false, reason: 'server_error', message: err?.message || 'No se pudo enviar el mensaje.' },
      { status: 500 }
    );
  }
}
