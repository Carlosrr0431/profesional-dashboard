import { NextResponse } from 'next/server';
import { getRouteMetrics } from '../../../../src/lib/geo/index.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const originLat = Number.parseFloat(searchParams.get('originLat'));
    const originLng = Number.parseFloat(searchParams.get('originLng'));
    const destLat = Number.parseFloat(searchParams.get('destLat'));
    const destLng = Number.parseFloat(searchParams.get('destLng'));

    if (![originLat, originLng, destLat, destLng].every(Number.isFinite)) {
      return NextResponse.json(
        { ok: false, error: 'Coordenadas de origen y destino requeridas' },
        { status: 400 },
      );
    }

    const metrics = await getRouteMetrics(
      { lat: originLat, lng: originLng },
      { lat: destLat, lng: destLng },
    );

    return NextResponse.json({ ok: true, data: metrics });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'No se pudo calcular la ruta' },
      { status: 500 },
    );
  }
}
