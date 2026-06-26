import { createHash } from 'crypto';
import { getSupabaseAdmin } from './supabaseAdmin';

function normalizeFingerprintPart(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildGeocodeErrorFingerprint({
  placeId,
  formattedAddress,
  title,
  subtitle,
  address,
  errorMessage,
}) {
  const payload = [
    normalizeFingerprintPart(errorMessage),
    normalizeFingerprintPart(placeId),
    normalizeFingerprintPart(title),
    normalizeFingerprintPart(subtitle),
    normalizeFingerprintPart(formattedAddress),
    normalizeFingerprintPart(address),
  ].join('|');

  return createHash('sha256').update(payload).digest('hex');
}

export function shouldTrackGeocodeError(errorMessage) {
  const message = String(errorMessage || '').trim();
  if (!message) return false;

  if (/osm|nominatim/i.test(message)) return true;
  if (/no se encontr[oó]/i.test(message)) return true;
  if (/debe estar en salta capital/i.test(message)) return true;
  if (/no se pudo geocodificar/i.test(message)) return true;
  if (/coordenadas osm incorrectas/i.test(message)) return true;

  return false;
}

/**
 * Registra o incrementa un error de geocodificación (fire-and-forget desde API routes).
 */
export async function recordGeocodeError({
  placeId = null,
  formattedAddress = null,
  title = null,
  subtitle = null,
  address = null,
  errorMessage,
  httpStatus = 404,
  requestPath = '/api/geo/geocode',
  resultLat = null,
  resultLng = null,
}) {
  const message = String(errorMessage || '').trim();
  if (!shouldTrackGeocodeError(message)) return null;

  const searchFingerprint = buildGeocodeErrorFingerprint({
    placeId,
    formattedAddress,
    title,
    subtitle,
    address,
    errorMessage: message,
  });

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: existing, error: selectError } = await supabase
    .from('geocode_error_logs')
    .select('id, occurrence_count, resolved')
    .eq('search_fingerprint', searchFingerprint)
    .maybeSingle();

  if (selectError) throw selectError;

  const rowPayload = {
    search_fingerprint: searchFingerprint,
    place_id: placeId,
    formatted_address: formattedAddress,
    title,
    subtitle,
    address,
    error_message: message,
    http_status: httpStatus,
    request_path: requestPath,
    last_seen_at: now,
    result_lat: Number.isFinite(Number(resultLat)) ? Number(resultLat) : null,
    result_lng: Number.isFinite(Number(resultLng)) ? Number(resultLng) : null,
  };

  if (existing?.id) {
    const { data, error } = await supabase
      .from('geocode_error_logs')
      .update({
        ...rowPayload,
        occurrence_count: Number(existing.occurrence_count || 1) + 1,
        resolved: false,
        resolved_at: null,
        resolved_note: null,
      })
      .eq('id', existing.id)
      .select('id')
      .single();

    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from('geocode_error_logs')
    .insert(rowPayload)
    .select('id')
    .single();

  if (error) throw error;
  return data;
}

export function logGeocodeErrorAsync(payload) {
  recordGeocodeError(payload).catch((err) => {
    console.error('[geocode-error-log] No se pudo guardar el error:', err?.message || err);
  });
}
