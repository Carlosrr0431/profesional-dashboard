/**
 * Mock de fetch para TomTom Search + Routing en tests del dashboard.
 */

function parseUrlParams(urlStr) {
  try {
    return new URL(urlStr).searchParams;
  } catch {
    return new URLSearchParams();
  }
}

function extractTomTomQuery(urlStr) {
  try {
    const url = new URL(urlStr);
    const parts = url.pathname.split('/').filter(Boolean);
    const endpoint = parts[parts.length - 1] || '';
    if (endpoint.endsWith('.json')) {
      return decodeURIComponent(endpoint.replace(/\.json$/, ''));
    }
    return '';
  } catch {
    return '';
  }
}

function tomtomSearchResponse(query) {
  const text = decodeURIComponent(String(query || ''));
  const lower = text.toLowerCase();

  if (lower.includes('chacabuco')) {
    return {
      results: [{
        type: 'Point Address',
        id: 'test-chacabuco',
        score: 9.1,
        position: { lat: -24.7889, lon: -65.4042 },
        address: {
          streetName: 'Chacabuco',
          streetNumber: '350',
          municipality: 'Salta',
          freeformAddress: 'Chacabuco 350, A4400 Salta, Argentina',
        },
      }],
    };
  }

  if (lower.includes('mitre')) {
    return {
      results: [{
        type: 'Point Address',
        id: 'test-mitre',
        score: 9.1,
        position: { lat: -24.7874909, lon: -65.4107292 },
        address: {
          streetName: 'Mitre',
          streetNumber: '200',
          municipality: 'Salta',
          freeformAddress: 'Bartolomé Mitre 200, A4400 Salta, Argentina',
        },
      }],
    };
  }

  if (lower.includes('balcarce')) {
    return {
      results: [{
        type: 'Point Address',
        id: 'test-balcarce',
        score: 9.1,
        position: { lat: -24.7850, lon: -65.4080 },
        address: {
          streetName: 'Balcarce',
          streetNumber: '500',
          municipality: 'Salta',
          freeformAddress: 'Balcarce 500, Salta, Argentina',
        },
      }],
    };
  }

  if (lower.includes('unsa') || lower.includes('universidad nacional de salta')) {
    return {
      results: [{
        type: 'POI',
        id: 'test-unsa',
        score: 9.4,
        position: { lat: -24.735437, lon: -65.386858 },
        poi: { name: 'Universidad Nacional de Salta' },
        address: {
          municipality: 'Salta',
          freeformAddress: 'Universidad Nacional de Salta, Salta, Argentina',
        },
      }],
    };
  }

  return {
    results: [{
      type: 'Point Address',
      id: 'test-place-1',
      score: 8.8,
      position: { lat: -24.7945667, lon: -65.3766708 },
      address: {
        streetName: text.includes('Mitre') ? 'Mitre' : 'Cherin',
        streetNumber: '200',
        municipality: 'Salta',
        freeformAddress: text.includes('Cherin')
          ? 'Cherin Pizzeria Artesanal, Salta, Argentina'
          : `${text || 'Calle Test 100'}, Salta, Argentina`,
      },
    }],
  };
}

function tomtomRouteResponse() {
  return {
    formatVersion: '0.0.12',
    routes: [{
      summary: {
        lengthInMeters: 4200,
        travelTimeInSeconds: 720,
      },
      legs: [{
        points: [
          { latitude: -24.78, longitude: -65.41 },
          { latitude: -24.7945667, longitude: -65.3766708 },
        ],
      }],
      guidance: {
        instructions: [{
          message: 'Seguí derecho',
          maneuver: 'DEPART',
          point: { latitude: -24.78, longitude: -65.41 },
          routeOffsetInMeters: 0,
          travelTimeInSeconds: 0,
        }],
      },
    }],
  };
}

function createGeoFetchHandler(baseHandler) {
  return async (url, options) => {
    const urlStr = String(url);

    if (urlStr.includes('api.tomtom.com/search/2/reverseGeocode')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          addresses: [{
            address: {
              freeformAddress: 'Cherin Pizzeria Artesanal, Salta, Argentina',
            },
            position: { lat: -24.7945667, lon: -65.3766708 },
          }],
        }),
      };
    }

    if (urlStr.includes('api.tomtom.com/search/2/place.json')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          result: {
            type: 'Point Address',
            id: 'test-place-1',
            score: 8.8,
            position: { lat: -24.7945667, lon: -65.3766708 },
            address: {
              freeformAddress: 'Cherin Pizzeria Artesanal, Salta, Argentina',
            },
          },
        }),
      };
    }

    if (urlStr.includes('api.tomtom.com/search/2/search/')
      || urlStr.includes('api.tomtom.com/search/2/geocode/')
      || urlStr.includes('api.tomtom.com/search/2/poiSearch/')) {
      const query = extractTomTomQuery(urlStr);
      return {
        ok: true,
        status: 200,
        json: async () => tomtomSearchResponse(query),
      };
    }

    if (urlStr.includes('api.tomtom.com/routing/1/calculateRoute')) {
      return {
        ok: true,
        status: 200,
        json: async () => tomtomRouteResponse(),
      };
    }

    if (urlStr.includes('nominatim') && urlStr.includes('/search')) {
      const params = parseUrlParams(urlStr);
      const query = params.get('q') || '';
      const mapped = tomtomSearchResponse(query).results.map((item) => ({
        lat: String(item.position.lat),
        lon: String(item.position.lon),
        display_name: item.address.freeformAddress,
        place_id: item.id,
        importance: item.score / 10,
        class: 'highway',
        type: 'residential',
        address: {
          road: item.address.streetName,
          house_number: item.address.streetNumber,
        },
      }));
      return { ok: true, status: 200, json: async () => mapped };
    }

    if (urlStr.includes('/route/v1/driving') || urlStr.includes('profesional-osrm')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          code: 'Ok',
          routes: [{
            distance: 4200,
            duration: 720,
            geometry: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
            legs: [{ distance: 4200, duration: 720, steps: [] }],
          }],
        }),
      };
    }

    if (urlStr.includes('maps.googleapis.com/maps/api/geocode')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'OK',
          results: [{
            formatted_address: 'Cherin Pizzeria Artesanal, Salta, Argentina',
            geometry: { location: { lat: -24.7945667, lng: -65.3766708 }, location_type: 'ROOFTOP' },
            types: ['street_address'],
            address_components: [
              { long_name: 'Cherin', types: ['route'] },
              { long_name: '100', types: ['street_number'] },
            ],
          }],
        }),
      };
    }

    if (urlStr.includes('maps.googleapis.com/maps/api/directions')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'OK',
          routes: [{
            legs: [{
              distance: { value: 4200 },
              duration: { value: 720 },
              duration_in_traffic: { value: 780 },
              start_address: 'Origen Test, Salta',
              end_address: 'Cherin Pizzeria Artesanal, Salta',
              start_location: { lat: -24.78, lng: -65.41 },
              end_location: { lat: -24.7945667, lng: -65.3766708 },
            }],
            summary: 'Ruta test',
          }],
        }),
      };
    }

    if (urlStr.includes('maps.googleapis.com/maps/api/place')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'OK',
          predictions: [{
            place_id: 'test-place-1',
            description: 'Cherin Pizzeria Artesanal, Salta',
          }],
        }),
      };
    }

    if (typeof baseHandler === 'function') {
      return baseHandler(url, options);
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => '{}',
    };
  };
}

function installGeoFetchMock(baseHandler) {
  global.fetch = jest.fn(createGeoFetchHandler(baseHandler));
  return global.fetch;
}

module.exports = {
  createGeoFetchHandler,
  installGeoFetchMock,
  tomtomSearchResponse,
  tomtomRouteResponse,
  nominatimSearchResponse: tomtomSearchResponse,
  osrmRouteResponse: tomtomRouteResponse,
};
