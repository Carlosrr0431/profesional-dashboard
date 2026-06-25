import { NextResponse } from 'next/server';
import { reverseGeocode } from '../../../../src/lib/geo/index.js';
import { getCachedGooglePlaceDetailsNearCoords } from '../../../../src/lib/googlePlaceDetailsCache';

export const dynamic = 'force-dynamic';
export const maxDuration = 25;

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

    // 1) POI cacheado en Supabase (misma prioridad que /api/geo/geocode con placeId).
    const cached = await getCachedGooglePlaceDetailsNearCoords(lat, lng).catch(() => null);
    if (cached?.formattedAddress) {
      return NextResponse.json({
        ok: true,
        data: {
          formattedAddress: cached.formattedAddress,
          lat: cached.lat,
          lng: cached.lng,
          placeId: cached.placeId,
          title: cached.title,
          subtitle: cached.subtitle,
          geocodeSource: cached.geocodeSource || 'supabase_cache',
        },
      });
    }

    // 2) Nominatim/OSM inverso (servidor) + TomTom + Nominatim público.
    const formattedAddress = await reverseGeocode(lat, lng);
    if (/^-?\d+\.\d{4,},\s*-?\d+\.\d{4,}$/.test(String(formattedAddress || '').trim())) {
      return NextResponse.json(
        { ok: false, error: 'No se pudo obtener la dirección para esas coordenadas' },
        { status: 404 },
      );
    }
    return NextResponse.json({
      ok: true,
      data: {
        formattedAddress,
        geocodeSource: 'address_geocode',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Error de geocodificación inversa' },
      { status: 500 },
    );
  }
}
