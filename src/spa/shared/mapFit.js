const MARKER_PAD = 40;
const SIDE_PAD = 32;
const MIN_VISIBLE_H = 180;
const MIN_TOP = 56;
const MIN_BOTTOM = 120;

export function routeBounds(routeCoords, pickup, dropoff) {
  const lngs = [];
  const lats = [];

  if (Array.isArray(routeCoords)) {
    for (const point of routeCoords) {
      const lng = Number(point?.[0]);
      const lat = Number(point?.[1]);
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        lngs.push(lng);
        lats.push(lat);
      }
    }
  }

  for (const point of [pickup, dropoff]) {
    const lat = Number(point?.lat ?? point?.latitude);
    const lng = Number(point?.lng ?? point?.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      lats.push(lat);
      lngs.push(lng);
    }
  }

  if (!lngs.length || !lats.length) return null;
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

export function chromeToMapPadding(insets, mapSize) {
  const height = Number(mapSize?.height) || 0;
  const width = Number(mapSize?.width) || 0;
  let top = Math.max(MIN_TOP, Math.round(Number(insets?.top) || 0) + MARKER_PAD);
  let bottom = Math.max(MIN_BOTTOM, Math.round(Number(insets?.bottom) || 0) + MARKER_PAD);
  const side = Math.max(20, Math.min(SIDE_PAD, Math.round(width * 0.08) || SIDE_PAD));

  if (height > 0) {
    const room = Math.max(MIN_VISIBLE_H, height - 8);
    if (top + bottom > room - MIN_VISIBLE_H) {
      const chrome = Math.max(80, room - MIN_VISIBLE_H);
      const total = top + bottom;
      top = Math.max(40, Math.round((top / total) * chrome));
      bottom = Math.max(80, chrome - top);
    }
  }

  return { top, right: side, bottom, left: side };
}

export function paddingKey(padding) {
  if (!padding) return '0';
  return `${padding.top}|${padding.right}|${padding.bottom}|${padding.left}`;
}
