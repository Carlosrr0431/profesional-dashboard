/**
 * Cliente de APIs geo del dashboard (mantiene TOMTOM_API_KEY en servidor).
 */

function readDashboardUrl() {
  if (typeof process !== 'undefined' && process.env) {
    const fromEnv = String(process.env.EXPO_PUBLIC_DASHBOARD_URL || '').trim();
    if (fromEnv) return fromEnv.replace(/\/$/, '');
  }
  return 'https://profesional-dashboard.vercel.app';
}

async function dashboardGeoGet(path, { headers = {} } = {}) {
  const response = await fetch(`${readDashboardUrl()}${path}`, {
    headers: {
      Accept: 'application/json',
      ...headers,
    },
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
  return suggestions.slice(0, limit).map((item) => ({
    lat: item.lat,
    lng: item.lng,
    formattedAddress: item.address,
  }));
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

async function autocompleteAddressSalta(query, limit = 5) {
  const text = String(query || '').trim();
  if (text.length < 3) return [];
  const qs = new URLSearchParams({
    q: text,
    limit: String(Math.max(1, Math.min(limit, 8))),
  });
  return dashboardGeoGet(`/api/geo/autocomplete?${qs.toString()}`);
}

async function getPlaceDetails(placeId) {
  const id = String(placeId || '').trim();
  if (!id) throw new Error('place_id inválido');
  const qs = new URLSearchParams({ placeId: id });
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
