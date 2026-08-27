export function bearingDegrees(from, to) {
  if (!from || !to) return 0;
  const lat1 = (Number(from.lat) * Math.PI) / 180;
  const lat2 = (Number(to.lat) * Math.PI) / 180;
  const dLng = ((Number(to.lng) - Number(from.lng)) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function pointDistanceSq(lat, lng, coord) {
  const pointLng = Number(coord[0]);
  const pointLat = Number(coord[1]);
  const dLat = pointLat - lat;
  const dLng = pointLng - lng;
  return dLat * dLat + dLng * dLng;
}

export function remainingPolyline(coords, lat, lng) {
  if (!Array.isArray(coords) || coords.length < 2) return coords || [];
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return coords;

  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < coords.length; i += 1) {
    const dist = pointDistanceSq(lat, lng, coords[i]);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }

  const start = Math.min(best, coords.length - 2);
  return [[lng, lat], ...coords.slice(start + 1)];
}

export function polylineHeading(coords) {
  if (!Array.isArray(coords) || coords.length < 2) return 0;
  const from = coords[0];
  const to = coords[1];
  return bearingDegrees(
    { lat: Number(from[1]), lng: Number(from[0]) },
    { lat: Number(to[1]), lng: Number(to[0]) },
  );
}
