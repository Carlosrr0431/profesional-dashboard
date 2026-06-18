import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getDirectionsResponse } from '../../../../src/lib/geo/index.js';

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

function parseCoord(value, name) {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) {
    throw new Error(`${name} inválido`);
  }
  return n;
}

export async function GET(request) {
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

    const { searchParams } = new URL(request.url);
    const originLat = parseCoord(searchParams.get('originLat'), 'originLat');
    const originLng = parseCoord(searchParams.get('originLng'), 'originLng');
    const destLat = parseCoord(searchParams.get('destLat'), 'destLat');
    const destLng = parseCoord(searchParams.get('destLng'), 'destLng');

    const route = await getDirectionsResponse(
      { lat: originLat, lng: originLng },
      { lat: destLat, lng: destLng },
    );

    return NextResponse.json({
      ok: true,
      data: {
        distance: route.distance,
        duration: route.duration,
        durationStatic: route.durationStatic,
        polyline: route.polyline,
        steps: route.steps,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Error inesperado' },
      { status: 500 }
    );
  }
}
