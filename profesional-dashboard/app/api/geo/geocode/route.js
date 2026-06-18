import { NextResponse } from 'next/server';
import { geocodeAddress, getPlaceDetails } from '../../../../src/lib/geo/index.js';
import { isWithinSaltaCapital } from '../../../src/lib/constants';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const address = String(searchParams.get('address') || '').trim();
    const placeId = String(searchParams.get('placeId') || '').trim();

    let result;
    if (placeId) {
      result = await getPlaceDetails(placeId);
    } else if (address) {
      result = await geocodeAddress(address);
    } else {
      return NextResponse.json(
        { ok: false, error: 'address o placeId requerido' },
        { status: 400 },
      );
    }

    if (!isWithinSaltaCapital(result.lat, result.lng)) {
      return NextResponse.json(
        { ok: false, error: 'La dirección debe estar en Salta Capital' },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        formattedAddress: result.formattedAddress,
        lat: result.lat,
        lng: result.lng,
        placeId: placeId || null,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'No se pudo geocodificar' },
      { status: 404 },
    );
  }
}
