import { NextResponse } from 'next/server';
import { requireAdminUser } from '../../../src/lib/adminAuthServer';
import { getSupabaseAdmin } from '../../../src/lib/supabaseAdmin';

const VOICE_SELECT =
  'id, driver_id, sender_type, audio_url, duration_seconds, is_played, created_at';
const DRIVER_INBOX_LOOKBACK_MS = 12 * 60 * 60 * 1000;

function normalizeMessages(body) {
  const raw = Array.isArray(body?.messages)
    ? body.messages
    : body?.driver_id
      ? [body]
      : [];

  return raw
    .map((row) => ({
      driver_id: String(row?.driver_id || '').trim(),
      sender_type: String(row?.sender_type || 'base').trim() || 'base',
      audio_url: String(row?.audio_url || '').trim(),
      duration_seconds: Math.max(0, Number(row?.duration_seconds) || 0),
    }))
    .filter((row) => row.driver_id && row.audio_url);
}

function jsonError(message, status = 400, extra = {}) {
  return NextResponse.json(
    { ok: false, error: { message, ...extra } },
    { status },
  );
}

/**
 * Inserta mensajes de voz desde el dashboard (bypass RLS con service role).
 * El cliente autenticado no puede insertar como operador porque la RLS
 * solo permite driver_id = get_my_driver_id().
 */
export async function POST(request) {
  const auth = await requireAdminUser(request);
  if (!auth.user) {
    return jsonError(auth.error || 'No autorizado', auth.status || 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Cuerpo inválido');
  }

  const messages = normalizeMessages(body);
  if (messages.length === 0) {
    return jsonError('No hay mensajes para enviar');
  }

  if (messages.length > 100) {
    return jsonError('Máximo 100 destinatarios por envío');
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('voice_messages')
      .insert(messages)
      .select(VOICE_SELECT);

    if (error) {
      return jsonError(
        error.message || 'No se pudo guardar el mensaje de voz',
        500,
        { code: error.code || null, details: error.details || null },
      );
    }

    return NextResponse.json({
      ok: true,
      data: { count: data?.length || 0, rows: data || [] },
    });
  } catch (err) {
    return jsonError(err?.message || 'Error inesperado', 500);
  }
}

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (!auth.user) {
    return jsonError(auth.error || 'No autorizado', auth.status || 401);
  }

  const url = new URL(request.url);
  const inbox = String(url.searchParams.get('inbox') || '').trim();
  const driverId = String(url.searchParams.get('driver_id') || '').trim();

  try {
    const supabase = getSupabaseAdmin();

    if (inbox === '1' || inbox.toLowerCase() === 'true') {
      const sinceIso = new Date(Date.now() - DRIVER_INBOX_LOOKBACK_MS).toISOString();
      const { data, error } = await supabase
        .from('voice_messages')
        .select(VOICE_SELECT)
        .eq('sender_type', 'driver')
        .eq('is_played', false)
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(40);

      if (error) {
        return jsonError(error.message || 'No se pudieron leer los audios del chofer', 500, {
          code: error.code || null,
        });
      }

      return NextResponse.json({
        ok: true,
        data: { messages: data || [] },
      });
    }

    if (!driverId) {
      return jsonError('Falta el chofer');
    }

    const { data, error } = await supabase
      .from('voice_messages')
      .select(VOICE_SELECT)
      .eq('driver_id', driverId)
      .order('created_at', { ascending: true })
      .limit(80);

    if (error) {
      return jsonError(error.message || 'No se pudieron leer los mensajes de voz', 500, {
        code: error.code || null,
      });
    }

    return NextResponse.json({
      ok: true,
      data: { messages: data || [] },
    });
  } catch (err) {
    return jsonError(err?.message || 'Error inesperado', 500);
  }
}

export async function PATCH(request) {
  const auth = await requireAdminUser(request);
  if (!auth.user) {
    return jsonError(auth.error || 'No autorizado', auth.status || 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Cuerpo inválido');
  }

  const ids = [...new Set(
    (Array.isArray(body?.ids) ? body.ids : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  )];

  if (ids.length === 0) {
    return jsonError('Faltan los audios');
  }
  if (ids.length > 50) {
    return jsonError('Máximo 50 audios por marca');
  }

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('voice_messages')
      .update({ is_played: body?.is_played !== false })
      .in('id', ids);

    if (error) {
      return jsonError(error.message || 'No se pudo actualizar el audio', 500, {
        code: error.code || null,
      });
    }

    return NextResponse.json({
      ok: true,
      data: { ids },
    });
  } catch (err) {
    return jsonError(err?.message || 'Error inesperado', 500);
  }
}
