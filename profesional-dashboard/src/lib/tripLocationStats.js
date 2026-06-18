const FINAL_DEST_PREFIX = '[FINAL_DEST_JSON:';

function extractFinalDestFromNotes(notes) {
  const src = String(notes || '');
  const start = src.indexOf(FINAL_DEST_PREFIX);
  if (start === -1) return null;
  const jsonStart = start + FINAL_DEST_PREFIX.length;
  const jsonEnd = src.indexOf(']', jsonStart);
  if (jsonEnd === -1) return null;
  try {
    return JSON.parse(src.slice(jsonStart, jsonEnd));
  } catch {
    return null;
  }
}

function isApproachTrip(trip) {
  const notes = String(trip?.notes || '').toLowerCase();
  return notes.includes('[approach_only]') || notes.includes('creado automaticamente desde whatsapp');
}

function hasDistinctCoords(a, b) {
  if (!a || !b) return true;
  return Math.abs(a.lat - b.lat) > 0.0001 || Math.abs(a.lng - b.lng) > 0.0001;
}

/**
 * Punto de retiro del pasajero.
 * WhatsApp/approach: destination_* al crear; tras subir, origin_* guarda el retiro.
 */
function extractPickupLocation(trip) {
  const destLat = Number(trip?.destination_lat);
  const destLng = Number(trip?.destination_lng);
  const originLat = Number(trip?.origin_lat);
  const originLng = Number(trip?.origin_lng);
  const approach = isApproachTrip(trip);
  const status = String(trip?.status || '').toLowerCase();
  const boarded = status === 'in_progress' || status === 'completed';

  if (approach && boarded && Number.isFinite(originLat) && Number.isFinite(originLng)) {
    return {
      lat: originLat,
      lng: originLng,
      address: trip.origin_address || trip.destination_address,
    };
  }

  if (Number.isFinite(destLat) && Number.isFinite(destLng)) {
    if (approach || !extractFinalDestFromNotes(trip?.notes)) {
      return {
        lat: destLat,
        lng: destLng,
        address: trip.destination_address,
      };
    }
  }

  if (Number.isFinite(originLat) && Number.isFinite(originLng)) {
    return {
      lat: originLat,
      lng: originLng,
      address: trip.origin_address,
    };
  }

  return null;
}

/**
 * Destino final del viaje (FINAL_DEST_JSON o destination_* tras iniciar el tramo).
 */
function extractDestinationLocation(trip) {
  const finalFromNotes = extractFinalDestFromNotes(trip?.notes);
  if (
    finalFromNotes
    && Number.isFinite(Number(finalFromNotes.lat))
    && Number.isFinite(Number(finalFromNotes.lng))
  ) {
    return {
      lat: Number(finalFromNotes.lat),
      lng: Number(finalFromNotes.lng),
      address: finalFromNotes.address,
    };
  }

  const destLat = Number(trip?.destination_lat);
  const destLng = Number(trip?.destination_lng);
  const approach = isApproachTrip(trip);
  const status = String(trip?.status || '').toLowerCase();
  const boarded = status === 'in_progress' || status === 'completed';
  const pickup = extractPickupLocation(trip);

  if (!Number.isFinite(destLat) || !Number.isFinite(destLng)) return null;

  if (approach && boarded && hasDistinctCoords(pickup, { lat: destLat, lng: destLng })) {
    return {
      lat: destLat,
      lng: destLng,
      address: trip.destination_address,
    };
  }

  if (!approach && hasDistinctCoords(pickup, { lat: destLat, lng: destLng })) {
    return {
      lat: destLat,
      lng: destLng,
      address: trip.destination_address,
    };
  }

  return null;
}

function shortAddress(address) {
  const raw = String(address || '').trim();
  if (!raw) return 'Sin dirección';
  const first = raw.split(',')[0]?.trim();
  return first && first.length <= 48 ? first : `${raw.slice(0, 45)}…`;
}

function zoneKey(lat, lng) {
  return `${Number(lat).toFixed(2)},${Number(lng).toFixed(2)}`;
}

function aggregateLocationPoints(trips, extractLocation, isWithinBounds) {
  const zoneMap = {};
  const heatmapPoints = [];
  let tripsWithPoint = 0;

  trips.forEach((trip) => {
    const location = extractLocation(trip);
    if (!location || !isWithinBounds(location.lat, location.lng)) return;

    tripsWithPoint += 1;
    heatmapPoints.push({ lat: location.lat, lng: location.lng, weight: 1 });

    const key = zoneKey(location.lat, location.lng);
    if (!zoneMap[key]) {
      zoneMap[key] = {
        key,
        lat: location.lat,
        lng: location.lng,
        count: 0,
        sampleAddress: shortAddress(location.address),
      };
    }
    zoneMap[key].count += 1;
  });

  const topZones = Object.values(zoneMap)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return {
    heatmapPoints,
    topZones,
    pointCount: heatmapPoints.length,
    tripsWithPoint,
  };
}

function buildCombinedLocationView(pickupView, destinationView) {
  const mergedPoints = [...pickupView.heatmapPoints, ...destinationView.heatmapPoints];
  const zoneMap = {};

  [...pickupView.topZones, ...destinationView.topZones].forEach((zone) => {
    if (!zoneMap[zone.key]) {
      zoneMap[zone.key] = { ...zone, count: 0 };
    }
    zoneMap[zone.key].count += zone.count;
  });

  const topZones = Object.values(zoneMap)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return {
    heatmapPoints: mergedPoints,
    topZones,
    pointCount: mergedPoints.length,
    tripsWithPoint: pickupView.tripsWithPoint + destinationView.tripsWithPoint,
  };
}

function buildLocationViews(trips, isWithinBounds) {
  const pickup = aggregateLocationPoints(trips, extractPickupLocation, isWithinBounds);
  const destination = aggregateLocationPoints(trips, extractDestinationLocation, isWithinBounds);
  const combined = buildCombinedLocationView(pickup, destination);

  return {
    pickup: { ...pickup, label: 'Retiro' },
    destination: { ...destination, label: 'Destino' },
    combined: { ...combined, label: 'Combinado' },
  };
}

export {
  extractPickupLocation,
  extractDestinationLocation,
  buildLocationViews,
};
