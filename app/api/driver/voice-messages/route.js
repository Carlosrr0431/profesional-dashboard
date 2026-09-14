import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../src/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VOICE_SELECT =
  'id, driver_id, sender_type, audio_url, duration_seconds, is_played, created_at';

async function getDriverIdForUser(supabase, userId) {
  const { data, error } = await supabase
    .from('drivers')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.id || null;
}

export async function POST(request) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!jwt) {
      return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const { data: userData, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !userData?.user) {
      return NextResponse.json({ success: false, error: 'Token inválido' }, { status: 401 });
    }

    const driverId = await getDriverIdForUser(supabase, userData.user.id);
    if (!driverId) {
      return NextResponse.json({ success: false, error: 'Conductor no encontrado' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const audioUrl = String(body?.audio_url || body?.audioUrl || '').trim();
    const durationSeconds = Math.max(0, Number(body?.duration_seconds ?? body?.durationSeconds) || 0);

    if (!audioUrl) {
      return NextResponse.json({ success: false, error: 'Falta el audio' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('voice_messages')
      .insert({
        driver_id: driverId,
        sender_type: 'driver',
        audio_url: audioUrl,
        duration_seconds: durationSeconds,
        is_played: false,
      })
      .select(VOICE_SELECT)
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message || 'No se pudo guardar el audio' },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, message: data });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Error interno' },
      { status: 500 },
    );
  }
}
