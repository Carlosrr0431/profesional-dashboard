import { NextResponse } from 'next/server';
import { geocodeAddress, getPlaceDetails } from '../../../../src/lib/geo/index.js';
import { searchCachedPlaces } from '../../../../src/lib/googlePlacesBudgetStore';
import { findSavedPinnedAddresses } from '../../../../src/lib/savedPinnedAddresses';
import { isWithinServiceArea } from '../../../../src/lib/constants';
import { logGeocodeErrorAsync } from '../../../../src/lib/geocodeErrorLog';
import { isGoogleConfigured } from '../../../../shared/geo/googlePlaces.js';
import { coordsAllowedForQuery } from '../../../../shared/geo/mapConfig.js';

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

    let result;
    if (!placeId && address) {
      const saved = await findSavedPinnedAddresses(address).catch(() => []);
      const savedHit = saved.find((item) => coordsAllowedForQuery(item.lat, item.lng, address));
      if (savedHit) result = savedHit;
    }
    if (!result && !placeId && address) {
      const cached = await searchCachedPlaces(address, 5).catch(() => []);
      const hit = (cached || []).find((item) => (
        Number.isFinite(Number(item?.lat))
        && Number.isFinite(Number(item?.lng))
        && coordsAllowedForQuery(Number(item.lat), Number(item.lng), address)
      ));
      if (hit) {
        result = {
          lat: Number(hit.lat),
          lng: Number(hit.lng),
          formattedAddress: hit.formattedAddress || hit.address || address,
          placeId: hit.placeId || null,
          title: hit.title || null,
          subtitle: hit.subtitle || null,
          geocodeSource: 'cache',
        };
      }
    }
    if (!result && placeId) {
      result = await getPlaceDetails(placeId, {
        sessionToken,
        formattedAddress,
        title: context.title || undefined,
        subtitle: context.subtitle || undefined,
      });
    } else if (!result && address) {
      if (!isGoogleConfigured()) {
        return NextResponse.json(
          { ok: false, error: 'Google Places no configurado' },
          { status: 503 },
        );
      }
      result = await geocodeAddress(address, { sessionToken });
    } else if (!result) {
      return NextResponse.json(
        { ok: false, error: 'address o placeId requerido' },
        { status: 400 },
      );
    }

    // Texto libre fuera de Capital solo si nombra la localidad (evita "Güemes 700" en Cerrillos).
    const allowed = placeId
      ? isWithinServiceArea(result.lat, result.lng)
      : coordsAllowedForQuery(result.lat, result.lng, address);
    if (!allowed) {
      const boundsError = 'La dirección debe estar en la zona de cobertura: Salta, Vaqueros, Campo Quijano y alrededores.';
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
        geocodeSource: result.geocodeSource || null,
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
