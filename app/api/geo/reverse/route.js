import { NextResponse } from 'next/server';
import { reverseGeocode } from '../../../../src/lib/geo/index.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = Number.parseFloat(searchParams.get('lat'));
    const lng = Number.parseFloat(searchParams.get('lng'));

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json(
        { ok: false, error: 'lat y lng requeridos' },
        { status: 400 },
      );
    }

    const formattedAddress = await reverseGeocode(lat, lng);
    return NextResponse.json({ ok: true, data: { formattedAddress } });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Error de geocodificación inversa' },
      { status: 500 },
    );
  }
}
