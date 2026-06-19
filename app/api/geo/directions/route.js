import { NextResponse } from 'next/server';
import {
  getDirectionsResponse,
  getRouteMetrics,
  getPassengerFareRoute,
  decodePolyline,
} from '../../../../src/lib/geo/index.js';
import { pickPassengerFareRoute } from '../../../../shared/salta-route.js';

export const dynamic = 'force-dynamic';

function parseCoord(value) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function parseWaypointList(searchParams) {
  const raw = String(searchParams.get('waypoints') || '').trim();
  if (!raw) return [];

  return raw
    .split('|')
    .map((chunk) => {
      const [latRaw, lngRaw] = chunk.split(',');
      const lat = parseCoord(latRaw);
      const lng = parseCoord(lngRaw);
      if (lat === null || lng === null) return null;
      return { lat, lng };
    })
    .filter(Boolean);
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const originLat = parseCoord(searchParams.get('originLat'));
    const originLng = parseCoord(searchParams.get('originLng'));
    const destLat = parseCoord(searchParams.get('destLat'));
    const destLng = parseCoord(searchParams.get('destLng'));
    const withSteps = searchParams.get('steps') === 'true';
    const withAlternatives = searchParams.get('alternatives') === 'true';
    const waypoints = parseWaypointList(searchParams);

    if (![originLat, originLng, destLat, destLng].every(Number.isFinite)) {
      return NextResponse.json(
        { ok: false, error: 'Coordenadas de origen y destino requeridas' },
        { status: 400 },
      );
    }

    const origin = { lat: originLat, lng: originLng };
    const destination = { lat: destLat, lng: destLng };

    if (withSteps) {
      const route = await getDirectionsResponse(origin, destination);
      return NextResponse.json({
        ok: true,
        data: {
          distance: route.distance,
          duration: route.duration,
          durationStatic: route.durationStatic,
          polyline: route.polyline,
          steps: route.steps,
          distanceValue: route.distanceValue,
          durationValue: route.durationValue,
          polylineCoords: route.polylineCoords,
        },
      });
    }

    if (withAlternatives || waypoints.length > 0) {
      const routes = await getPassengerFareRoute(origin, destination, waypoints);
      const route = pickPassengerFareRoute(routes) || routes?.[0];
      if (!route) {
        return NextResponse.json(
          { ok: false, error: 'No se encontró ruta' },
          { status: 404 },
        );
      }

      return NextResponse.json({
        ok: true,
        data: {
          distanceValue: Math.round(Number(route.distance) || 0),
          durationValue: Math.round(Number(route.duration) || 0),
          polylineCoords: route.geometry ? decodePolyline(route.geometry) : [],
          legCount: Array.isArray(route.legs) ? route.legs.length : 1,
        },
      });
    }

    const metrics = await getRouteMetrics(origin, destination, waypoints);
    return NextResponse.json({ ok: true, data: metrics });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'No se pudo calcular la ruta' },
      { status: 500 },
    );
  }
}
