/**
 * Mock de fetch para Nominatim + OSRM en tests del dashboard.
 */

function parseUrlParams(urlStr) {
  try {
    return new URL(urlStr).searchParams;
  } catch {
    return new URLSearchParams();
  }
}

function nominatimSearchResponse(query) {
  const text = decodeURIComponent(String(query || ''));
  const lower = text.toLowerCase();

  if (lower.includes('chacabuco')) {
    return [{
      lat: '-24.7889',
      lon: '-65.4042',
      display_name: 'Chacabuco 350, A4400 Salta, Argentina',
      place_id: 'test-chacabuco',
      importance: 0.7,
      class: 'highway',
      type: 'residential',
      address: { road: 'Chacabuco', house_number: '350' },
    }];
  }

  if (lower.includes('mitre')) {
    return [{
      lat: '-24.7874909',
      lon: '-65.4107292',
      display_name: 'Bartolomé Mitre 200, A4400 Salta, Argentina',
      place_id: 'test-mitre',
      importance: 0.7,
      class: 'highway',
      type: 'residential',
      address: { road: 'Mitre', house_number: '200' },
    }];
  }

  if (lower.includes('balcarce')) {
    return [{
      lat: '-24.7850',
      lon: '-65.4080',
      display_name: 'Balcarce 500, Salta, Argentina',
      place_id: 'test-balcarce',
      importance: 0.7,
      class: 'highway',
      type: 'residential',
      address: { road: 'Balcarce', house_number: '500' },
    }];
  }

  return [{
    lat: '-24.7945667',
    lon: '-65.3766708',
    display_name: text.includes('Cherin')
      ? 'Cherin Pizzeria Artesanal, Salta, Argentina'
      : `${text || 'Calle Test 100'}, Salta, Argentina`,
    place_id: 'test-place-1',
    importance: 0.62,
    class: 'highway',
    type: 'residential',
    address: {
      road: text.includes('Mitre') ? 'Mitre' : 'Cherin',
      house_number: '200',
    },
  }];
}

function osrmRouteResponse() {
  return {
    code: 'Ok',
    routes: [{
      distance: 4200,
      duration: 720,
      geometry: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
      legs: [{
        distance: 4200,
        duration: 720,
        steps: [],
      }],
    }],
  };
}

function createGeoFetchHandler(baseHandler) {
  return async (url, options) => {
    const urlStr = String(url);

    if (urlStr.includes('nominatim') && urlStr.includes('/reverse')) {
      const params = parseUrlParams(urlStr);
      const lat = params.get('lat') || '-24.7945667';
      const lng = params.get('lon') || '-65.3766708';
      return {
        ok: true,
        status: 200,
        json: async () => ({
          display_name: `Cherin Pizzeria Artesanal, Salta, Argentina`,
          lat,
          lon: lng,
        }),
      };
    }

    if (urlStr.includes('nominatim') && urlStr.includes('/search')) {
      const params = parseUrlParams(urlStr);
      const query = params.get('q') || '';
      return {
        ok: true,
        status: 200,
        json: async () => nominatimSearchResponse(query),
      };
    }

    if (urlStr.includes('nominatim') && urlStr.includes('/lookup')) {
      return {
        ok: true,
        status: 200,
        json: async () => [{
          lat: '-24.7945667',
          lon: '-65.3766708',
          display_name: 'Cherin Pizzeria Artesanal, Salta, Argentina',
          place_id: 'test-place-1',
        }],
      };
    }

    if (urlStr.includes('/route/v1/driving') || urlStr.includes('profesional-osrm')) {
      return {
        ok: true,
        status: 200,
        json: async () => osrmRouteResponse(),
      };
    }

    if (urlStr.includes('maps.googleapis.com/maps/api/geocode')) {
      const isReverse = urlStr.includes('latlng=');
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
  nominatimSearchResponse,
  osrmRouteResponse,
};
