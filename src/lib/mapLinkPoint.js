import { parseGoogleMapsPoint } from '../../shared/savedAddressMatch';

export function looksLikeMapLink(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/google\.[^/\s]+\/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(text)) return true;
  return /!3d-?\d/.test(text) && /!4d-?\d/.test(text);
}

export function readMapLinkPoint(value) {
  if (!looksLikeMapLink(value)) return null;
  return parseGoogleMapsPoint(value);
}

export function formatMapPointLabel(lat, lng) {
  const part = (value) => Number(value).toFixed(7).replace(/0+$/, '').replace(/\.$/, '');
  return `${part(lat)}, ${part(lng)}`;
}

function validPin(lat, lng) {
  return Number.isFinite(lat)
    && Number.isFinite(lng)
    && Math.abs(lat) <= 90
    && Math.abs(lng) <= 180
    && !(lat === 0 && lng === 0)
    && !(Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01);
}

/** Pin de un enlace de Maps o de una coordenada dentro del mensaje, aunque haya más texto. */
export function readGpsPinFromPassengerText(value) {
  const text = String(value || '');
  const linked = readMapLinkPoint(text);
  if (linked && validPin(linked.lat, linked.lng)) return linked;

  const match = text.match(/(-?\d{1,2}\.\d{4,})\s*,\s*(-?\d{1,3}\.\d{4,})/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!validPin(lat, lng)) return null;
  return { lat, lng };
}
