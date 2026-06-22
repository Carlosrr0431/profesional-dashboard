/**
 * Cliente de APIs geo del dashboard (mantiene claves de servidor en backend).
 */

function readDashboardUrl() {
  if (typeof process !== 'undefined' && process.env) {
    const fromEnv = String(process.env.EXPO_PUBLIC_DASHBOARD_URL || '').trim();
    if (fromEnv) return fromEnv.replace(/\/$/, '');
  }
  return 'https://profesional-dashboard.vercel.app';
}

async function dashboardGeoGet(path, { headers = {}, signal } = {}) {
  const response = await fetch(`${readDashboardUrl()}${path}`, {
    headers: {
      Accept: 'application/json',
      ...headers,
    },
    signal,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `HTTP ${response.status}`);
  }
  return payload.data;
}

async function geocodeAddress(address) {
  const text = String(address || '').trim();
  if (!text) throw new Error('Dirección vacía');
  const qs = new URLSearchParams({ address: text });
  const data = await dashboardGeoGet(`/api/geo/geocode?${qs.toString()}`);
  return {
    lat: data.lat,
    lng: data.lng,
    formattedAddress: data.formattedAddress,
  };
}

async function geocodeAddressMultiple(address, limit = 5) {
  const suggestions = await autocompleteAddressSalta(address, Math.max(limit, 5));
  if (!suggestions.length) {
    throw new Error('No se encontró la dirección');
  }

  const results = [];
  for (const item of suggestions.slice(0, limit)) {
    if (Number.isFinite(item.lat) && Number.isFinite(item.lng)) {
      results.push({
        lat: item.lat,
        lng: item.lng,
        formattedAddress: item.address,
      });
      continue;
    }
    if (!item.placeId) continue;
    const details = await getPlaceDetails(item.placeId, {
      sessionToken: item.sessionToken,
      formattedAddress: item.address,
      title: item.title,
      subtitle: item.subtitle,
    });
    results.push({
      lat: details.lat,
      lng: details.lng,
      formattedAddress: details.formattedAddress || item.address,
    });
  }
  if (!results.length) {
    throw new Error('No se encontró la dirección');
  }
  return results;
}

async function reverseGeocode(lat, lng) {
  const fallback = `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
  try {
    const qs = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
    });
    const data = await dashboardGeoGet(`/api/geo/reverse?${qs.toString()}`);
    return String(data?.formattedAddress || data?.address || '').trim() || fallback;
  } catch {
    return fallback;
  }
}

async function autocompleteAddressSalta(query, limit = 5, options = {}) {
  const text = String(query || '').trim();
  if (text.length < 2) return [];
  const qs = new URLSearchParams({
    q: text,
    limit: String(Math.max(1, Math.min(limit, 8))),
  });
  if (options?.sessionToken) {
    qs.set('sessionToken', String(options.sessionToken));
  }
  return dashboardGeoGet(`/api/geo/autocomplete?${qs.toString()}`, {
    signal: options.signal,
  });
}

async function getPlaceDetails(placeId, options = {}) {
  const id = String(placeId || '').trim();
  if (!id) throw new Error('place_id inválido');
  const qs = new URLSearchParams({ placeId: id });
  if (options?.sessionToken) {
    qs.set('sessionToken', String(options.sessionToken));
  }
  if (options?.formattedAddress) {
    qs.set('formattedAddress', String(options.formattedAddress));
  }
  if (options?.title) {
    qs.set('title', String(options.title));
  }
  if (options?.subtitle) {
    qs.set('subtitle', String(options.subtitle));
  }
  const data = await dashboardGeoGet(`/api/geo/geocode?${qs.toString()}`);
  return {
    lat: data.lat,
    lng: data.lng,
    formattedAddress: data.formattedAddress,
  };
}

module.exports = {
  readDashboardUrl,
  geocodeAddress,
  geocodeAddressMultiple,
  reverseGeocode,
  autocompleteAddressSalta,
  getPlaceDetails,
};
