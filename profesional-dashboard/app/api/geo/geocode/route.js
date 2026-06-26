import { NextResponse } from 'next/server';
import { geocodeAddress, getPlaceDetails } from '../../../../src/lib/geo/index.js';
import { isWithinSaltaCapital } from '../../../../src/lib/constants';
import { logGeocodeErrorAsync } from '../../../../src/lib/geocodeErrorLog';
import {
  getCachedGooglePlaceDetails,
  upsertGooglePlaceDetailsCache,
} from '../../../../src/lib/googlePlaceDetailsCache';

export const dynamic = 'force-dynamic';

function readGeocodeRequestContext(searchParams) {
  return {
    placeId: String(searchParams.get('placeId') || '').trim() || null,
    formattedAddress: String(
      searchParams.get('formattedAddress')
      || searchParams.get('address')
      || '',
    ).trim() || null,
    title: String(searchParams.get('title') || '').trim() || null,
    subtitle: String(searchParams.get('subtitle') || '').trim() || null,
    address: String(searchParams.get('address') || '').trim() || null,
    requestPath: '/api/geo/geocode',
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const context = readGeocodeRequestContext(searchParams);

  try {
    const address = String(searchParams.get('address') || '').trim();
    const placeId = String(searchParams.get('placeId') || '').trim();
    const sessionToken = String(searchParams.get('sessionToken') || '').trim() || undefined;
    const formattedAddress = context.formattedAddress || undefined;
    const isGooglePlaceId = placeId.startsWith('google:');

    let result;
    let geocodeSource = null;
    if (placeId) {
      if (isGooglePlaceId) {
        const cached = await getCachedGooglePlaceDetails(placeId);
        if (cached) {
          result = cached;
          geocodeSource = 'supabase_cache';
        } else {
          result = await getPlaceDetails(placeId, {
            sessionToken,
            formattedAddress,
            title: context.title || undefined,
            subtitle: context.subtitle || undefined,
          });
          geocodeSource = 'google_place_details_essentials';
          await upsertGooglePlaceDetailsCache({
            placeId: placeId || result.placeId,
            formattedAddress: result.formattedAddress || formattedAddress || null,
            lat: result.lat,
            lng: result.lng,
            title: result.title || context.title || null,
            subtitle: result.subtitle || context.subtitle || null,
            types: result.types || [],
          });
        }
      } else {
        result = await getPlaceDetails(placeId, {
          sessionToken,
          formattedAddress,
          title: context.title || undefined,
          subtitle: context.subtitle || undefined,
        });
        geocodeSource = 'place_details';
      }
    } else if (address) {
      result = await geocodeAddress(address);
      geocodeSource = 'address_geocode';
    } else {
      return NextResponse.json(
        { ok: false, error: 'address o placeId requerido' },
        { status: 400 },
      );
    }

    if (!isWithinSaltaCapital(result.lat, result.lng)) {
      const boundsError = 'La dirección debe estar en Salta Capital';
      logGeocodeErrorAsync({
        ...context,
        errorMessage: boundsError,
        httpStatus: 400,
      });

      return NextResponse.json(
        { ok: false, error: boundsError },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        formattedAddress: result.formattedAddress,
        lat: result.lat,
        lng: result.lng,
        placeId: placeId || result.placeId || null,
        title: result.title || context.title || null,
        subtitle: result.subtitle || context.subtitle || null,
        geocodeSource,
      },
    });
  } catch (err) {
    const errorMessage = err?.message || 'No se pudo geocodificar';
    logGeocodeErrorAsync({
      ...context,
      errorMessage,
      httpStatus: 404,
    });

    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status: 404 },
    );
  }
}
