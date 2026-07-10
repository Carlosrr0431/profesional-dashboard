import { NextResponse } from 'next/server';
import { requireAdminUser } from '../../../src/lib/adminAuthServer';
import { getSupabaseAdmin } from '../../../src/lib/supabaseAdmin';

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

/**
 * Inserta mensajes de voz desde el dashboard (bypass RLS con service role).
 * El cliente autenticado no puede insertar como operador porque la RLS
 * solo permite driver_id = get_my_driver_id().
 */
export async function POST(request) {
  const auth = await requireAdminUser(request);
  if (!auth.user) {
    return NextResponse.json(
      { ok: false, error: { message: auth.error || 'No autorizado' } },
      { status: auth.status || 401 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { message: 'Cuerpo inválido' } },
      { status: 400 },
    );
  }

  const messages = normalizeMessages(body);
  if (messages.length === 0) {
    return NextResponse.json(
      { ok: false, error: { message: 'No hay mensajes para enviar' } },
      { status: 400 },
    );
  }

  if (messages.length > 100) {
    return NextResponse.json(
      { ok: false, error: { message: 'Máximo 100 destinatarios por envío' } },
      { status: 400 },
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('voice_messages')
      .insert(messages)
      .select('id, driver_id');

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: error.code || null,
            message: error.message || 'No se pudo guardar el mensaje de voz',
            details: error.details || null,
          },
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      data: { count: data?.length || 0, rows: data || [] },
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: { message: err?.message || 'Error inesperado' },
      },
      { status: 500 },
    );
  }
}
