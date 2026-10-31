import { NextResponse } from 'next/server';
import { reverseGeocode, reverseGeocodeForPin } from '../../../../src/lib/geo/index.js';
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

    // cacheOnly=1: solo el nombre guardado cerca del punto. La latitud y longitud
    // de la respuesta son siempre las que llegaron, no las del cache.
    if (searchParams.get('cacheOnly') === '1') {
      const nearPlace = await getCachedGooglePlaceDetailsNearCoords(lat, lng, 40).catch(() => null);
      const name = String(nearPlace?.formattedAddress || nearPlace?.title || '').trim();
      return NextResponse.json({
        ok: true,
        data: {
          formattedAddress: name || null,
          lat,
          lng,
          title: name || null,
          fromCache: Boolean(name),
        },
      });
    }

    // exact=1: el clic del mapa. No se reemplaza por un barrio ni por un local lejano.
    const exact = searchParams.get('exact') === '1';
    if (exact) {
      const nearPlace = await getCachedGooglePlaceDetailsNearCoords(lat, lng, 40).catch(() => null);
      if (nearPlace?.formattedAddress || nearPlace?.title) {
        return NextResponse.json({
          ok: true,
          data: {
            formattedAddress: nearPlace.formattedAddress || nearPlace.title,
            lat,
            lng,
            placeId: nearPlace.placeId,
            title: nearPlace.title,
            subtitle: nearPlace.subtitle,
            precise: true,
            geocodeSource: 'map_pick',
          },
        });
      }

      const pin = await reverseGeocodeForPin(lat, lng);
      const coordsLabel = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      return NextResponse.json({
        ok: true,
        data: {
          formattedAddress: pin.precise ? pin.label : coordsLabel,
          lat,
          lng,
          precise: Boolean(pin.precise),
          geocodeSource: 'map_pick',
        },
      });
    }

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
