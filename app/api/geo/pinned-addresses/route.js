import { NextResponse } from 'next/server';
import { requireAdminUser } from '../../../../src/lib/adminAuthServer';
import { getSupabaseAdmin } from '../../../../src/lib/supabaseAdmin';
import {
  clearSavedPinnedAddressCache,
  listSavedPinnedAddresses,
} from '../../../../src/lib/savedPinnedAddresses';
import { parseGoogleMapsPoint } from '../../../../shared/savedAddressMatch';
import { isWithinServiceArea } from '../../../../src/lib/constants';

export const dynamic = 'force-dynamic';

function toPublicRow(row) {
  return {
    id: row.id,
    title: row.title,
    lat: Number(row.lat),
    lng: Number(row.lng),
  };
}

export async function GET() {
  const rows = await listSavedPinnedAddresses();
  return NextResponse.json(
    { ok: true, data: rows.map(toPublicRow) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request) {
  const auth = await requireAdminUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const title = String(body?.title || '').trim().replace(/\s+/g, ' ');
    const point = parseGoogleMapsPoint(body?.point || body?.url || '');
    if (title.length < 4) {
      return NextResponse.json(
        { ok: false, error: 'Escribí el nombre de la dirección, con al menos 4 letras.' },
        { status: 400 },
      );
    }
    if (!point) {
      return NextResponse.json(
        { ok: false, error: 'No pude leer el punto. Pegá el enlace de Google Maps o latitud y longitud.' },
        { status: 400 },
      );
    }
    if (!isWithinServiceArea(point.lat, point.lng)) {
      return NextResponse.json(
        { ok: false, error: 'Ese punto queda fuera de la zona de cobertura.' },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('pinned_addresses')
      .insert({ title, lat: point.lat, lng: point.lng })
      .select('id, title, lat, lng')
      .single();
    if (error) throw error;
    clearSavedPinnedAddressCache();
    return NextResponse.json({ ok: true, data: toPublicRow(data) });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'No se pudo guardar la dirección.' },
      { status: 500 },
    );
  }
}

export async function DELETE(request) {
  const auth = await requireAdminUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const id = String(new URL(request.url).searchParams.get('id') || '').trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: 'Falta la dirección a borrar.' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('pinned_addresses').delete().eq('id', id);
    if (error) throw error;
    clearSavedPinnedAddressCache();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'No se pudo borrar la dirección.' },
      { status: 500 },
    );
  }
}
