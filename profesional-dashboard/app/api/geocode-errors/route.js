import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../src/lib/supabaseAdmin';
import { recordGeocodeError } from '../../../src/lib/geocodeErrorLog';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const filter = String(searchParams.get('filter') || 'pending').trim();
    const limit = Math.min(Math.max(Number(searchParams.get('limit') || 100), 1), 500);

    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('geocode_error_logs')
      .select('*')
      .order('last_seen_at', { ascending: false })
      .limit(limit);

    if (filter === 'pending') {
      query = query.eq('resolved', false);
    } else if (filter === 'resolved') {
      query = query.eq('resolved', true);
    }

    const { data, error } = await query;
    if (error) throw error;

    const { count: pendingCount, error: countError } = await supabase
      .from('geocode_error_logs')
      .select('id', { count: 'exact', head: true })
      .eq('resolved', false);

    if (countError) throw countError;

    return NextResponse.json({
      ok: true,
      data: data || [],
      stats: {
        pending: pendingCount || 0,
        returned: (data || []).length,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'No se pudieron cargar los errores de geocodificación' },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const title = String(body?.title || '').trim() || null;
    const subtitle = String(body?.subtitle || '').trim() || null;
    const formattedAddress = String(body?.formattedAddress || body?.formatted_address || '').trim() || null;
    const placeId = String(body?.placeId || body?.place_id || '').trim() || null;
    const resultLat = Number(body?.resultLat ?? body?.result_lat);
    const resultLng = Number(body?.resultLng ?? body?.result_lng);
    const note = String(body?.note || '').trim();

    if (!title && !formattedAddress) {
      return NextResponse.json(
        { ok: false, error: 'title o formattedAddress requerido' },
        { status: 400 },
      );
    }

    if (!Number.isFinite(resultLat) || !Number.isFinite(resultLng)) {
      return NextResponse.json(
        { ok: false, error: 'resultLat y resultLng requeridos' },
        { status: 400 },
      );
    }

    const errorMessage = note
      ? `Coordenadas OSM incorrectas para el lugar (${note})`
      : 'Coordenadas OSM incorrectas para el lugar';

    const data = await recordGeocodeError({
      placeId,
      formattedAddress,
      title,
      subtitle,
      errorMessage,
      httpStatus: 422,
      requestPath: '/api/geo/geocode',
      resultLat,
      resultLng,
    });

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'No se pudo registrar el error de coordenadas' },
      { status: 500 },
    );
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const id = String(body?.id || '').trim();
    const resolved = Boolean(body?.resolved);
    const resolvedNote = String(body?.resolved_note || '').trim() || null;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: 'id requerido' },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('geocode_error_logs')
      .update({
        resolved,
        resolved_at: resolved ? new Date().toISOString() : null,
        resolved_note: resolved ? resolvedNote : null,
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'No se pudo actualizar el registro' },
      { status: 500 },
    );
  }
}
