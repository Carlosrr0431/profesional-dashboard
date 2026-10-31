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
