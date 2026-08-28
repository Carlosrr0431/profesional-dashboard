export function bearingDegrees(from, to) {
  if (!from || !to) return 0;
  const lat1 = (Number(from.lat) * Math.PI) / 180;
  const lat2 = (Number(to.lat) * Math.PI) / 180;
  const dLng = ((Number(to.lng) - Number(from.lng)) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function snapCoordToSegment(lat, lng, a, b) {
  const ax = Number(a[0]);
  const ay = Number(a[1]);
  const bx = Number(b[0]);
  const by = Number(b[1]);
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { lng: ax, lat: ay, distSq: (lng - ax) ** 2 + (lat - ay) ** 2 };
  let t = ((lng - ax) * dx + (lat - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const snapLng = ax + t * dx;
  const snapLat = ay + t * dy;
  return {
    lng: snapLng,
    lat: snapLat,
    distSq: (lng - snapLng) ** 2 + (lat - snapLat) ** 2,
  };
}

export function snapToPolyline(coords, lat, lng) {
  if (!Array.isArray(coords) || coords.length < 2 || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  let best = null;
  let bestDist = Infinity;
  let bestIndex = 0;
  for (let i = 0; i < coords.length - 1; i += 1) {
    const snapped = snapCoordToSegment(lat, lng, coords[i], coords[i + 1]);
    if (snapped.distSq < bestDist) {
      bestDist = snapped.distSq;
      best = snapped;
      bestIndex = i;
    }
  }

  if (!best) return { lat, lng, index: 0 };
  return { lat: best.lat, lng: best.lng, index: bestIndex };
}

export function remainingPolyline(coords, lat, lng) {
  if (!Array.isArray(coords) || coords.length < 2) return coords || [];
  const snap = snapToPolyline(coords, lat, lng);
  if (!snap) return coords;
  const rest = coords.slice(snap.index + 1);
  return [[snap.lng, snap.lat], ...rest];
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

export function smoothAngle(current, target, factor = 0.32) {
  const from = Number(current);
  const to = Number(target);
  if (!Number.isFinite(from)) return Number.isFinite(to) ? to : 0;
  if (!Number.isFinite(to)) return from;
  const delta = ((to - from + 540) % 360) - 180;
  return (from + delta * factor + 360) % 360;
}

export function offsetAlongBearing(lat, lng, bearing, meters) {
  const R = 6378137;
  const brng = (Number(bearing) * Math.PI) / 180;
  const lat1 = (Number(lat) * Math.PI) / 180;
  const lng1 = (Number(lng) * Math.PI) / 180;
  const ang = Number(meters) / R;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(ang) + Math.cos(lat1) * Math.sin(ang) * Math.cos(brng),
  );
  const lng2 = lng1 + Math.atan2(
    Math.sin(brng) * Math.sin(ang) * Math.cos(lat1),
    Math.cos(ang) - Math.sin(lat1) * Math.sin(lat2),
  );
  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
}
