export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const toRad = (value) => (value * Math.PI) / 180;

export const getRegionForCoordinates = (points) => {
  if (!points || points.length === 0) {
    return {
      latitude: -34.6037,
      longitude: -58.3816,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
  }

  let minLat = points[0].latitude;
  let maxLat = points[0].latitude;
  let minLng = points[0].longitude;
  let maxLng = points[0].longitude;

  points.forEach((point) => {
    minLat = Math.min(minLat, point.latitude);
    maxLat = Math.max(maxLat, point.latitude);
    minLng = Math.min(minLng, point.longitude);
    maxLng = Math.max(maxLng, point.longitude);
  });

  const midLat = (minLat + maxLat) / 2;
  const midLng = (minLng + maxLng) / 2;
  const deltaLat = (maxLat - minLat) * 1.4;
  const deltaLng = (maxLng - minLng) * 1.4;

  return {
    latitude: midLat,
    longitude: midLng,
    latitudeDelta: Math.max(deltaLat, 0.01),
    longitudeDelta: Math.max(deltaLng, 0.01),
  };
};

export const getBearing = (startLat, startLng, destLat, destLng) => {
  const startLatRad = toRad(startLat);
  const destLatRad = toRad(destLat);
  const diffLng = toRad(destLng - startLng);

  const x = Math.sin(diffLng) * Math.cos(destLatRad);
  const y =
    Math.cos(startLatRad) * Math.sin(destLatRad) -
    Math.sin(startLatRad) * Math.cos(destLatRad) * Math.cos(diffLng);

  let bearing = Math.atan2(x, y);
  bearing = (bearing * 180) / Math.PI;
  return (bearing + 360) % 360;
};

const DEFAULT_EDGE_PADDING = { top: 80, right: 40, bottom: 200, left: 40 };

export function fitMapToCoordinates(mapRef, coords = [], edgePadding = DEFAULT_EDGE_PADDING) {
  const points = coords.filter(
    (p) => Number.isFinite(p?.latitude) && Number.isFinite(p?.longitude),
  );
  if (!mapRef?.current || points.length === 0) return;
  mapRef.current.fitToCoordinates(points, { edgePadding, animated: true });
}

export function animateMapCamera(mapRef, { center, bearing = 0, pitch = 0, zoom = 16 }, duration = 250) {
  if (!mapRef?.current || !center) return;
  mapRef.current.animateCamera(
    {
      center: { latitude: center.latitude, longitude: center.longitude },
      heading: bearing,
      pitch,
      zoom,
    },
    { duration },
  );
}
