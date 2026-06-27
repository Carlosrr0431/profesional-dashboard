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

  if (lower.includes('bolivia') && lower.includes('200')) {
    return {
      results: [{
        type: 'Point Address',
        id: 'test-bolivia-200',
        score: 9.2,
        position: { lat: -24.7821, lon: -65.4012 },
        address: {
          streetName: 'Bolivia',
          streetNumber: '200',
          municipality: 'Salta',
          freeformAddress: 'Avenida Bolivia 200, Salta, Argentina',
        },
      }],
    };
  }

  if (lower.includes('entre') && lower.includes('200')) {
    return {
      results: [{
        type: 'Point Address',
        id: 'test-entre-rios-200',
        score: 9.2,
        position: { lat: -24.781482624, lon: -65.404901193 },
        address: {
          streetName: 'Entre Ríos',
          streetNumber: '200',
          municipality: 'Salta',
          freeformAddress: 'Avenida Entre Ríos 200, Salta, Argentina',
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

function googleAutocompleteResponse(query) {
  const lower = String(query || '').toLowerCase();

  const makePred = (placeId, main, secondary, types = ['establishment']) => ({
    placePrediction: {
      placeId,
      place: `places/${placeId}`,
      structuredFormat: {
        mainText: { text: main },
        secondaryText: { text: secondary },
      },
      text: { text: `${main}, ${secondary}` },
      types,
    },
  });

  if (lower.includes('grido')) {
    return {
      suggestions: [
        makePred('google-grido-1', 'Grido helado', 'Av. Entre Ríos 395, Salta, Argentina', ['ice_cream_shop']),
        makePred('google-grido-2', 'Grido helado', 'Av. San Martín 1125, Salta, Argentina', ['ice_cream_shop']),
      ],
    };
  }

  if (lower.includes('shop') || lower.includes('shoping')) {
    return {
      suggestions: [
        makePred('google-shopping-salta', 'Shopping Salta', 'Buenos Aires 88, Salta, Argentina', ['shopping_mall']),
        makePred('google-alto-noa', 'Alto NOA Shopping', 'Av. del Bicentenario 702, Salta, Argentina', ['shopping_mall']),
      ],
    };
  }

  if (lower.includes('unsa') || lower.includes('universidad nacional de salta')) {
    return {
      suggestions: [
        makePred('google-unsa', 'Universidad Nacional de Salta', 'Av. Bolivia, Salta, Argentina', ['university']),
      ],
    };
  }

  if (lower.includes('mitre')) {
    return {
      suggestions: [
        makePred('google-mitre', 'Bartolomé Mitre', 'Salta, Argentina', ['route']),
      ],
    };
  }

  if (lower.includes('jaraba') || lower.includes('jarava')) {
    return {
      suggestions: [
        makePred('google-jaraba-poi', 'Imagenes Jaraba', 'Pueyrredón, Salta', ['store']),
        makePred('google-jaraba-mitre', 'Imagenes Jaraba', 'Bartolomé Mitre, Salta', ['store']),
      ],
    };
  }

  if (lower.includes('fransisca') || lower.includes('francisca')) {
    return {
      suggestions: [
        makePred('google-francisca-arenales', 'La Fransisca', 'Arenales, Salta', ['store']),
        makePred('google-francisca-bicentenario', 'La Francisca', 'Bicentenario, Salta', ['store']),
      ],
    };
  }

  if (lower.includes('punto') && (lower.includes('shop') || lower.includes('shoping'))) {
    return {
      suggestions: [
        makePred('google-punto-shopping', 'El Punto Shopping', 'Av. Finca Yerba Buena 4401, San Lorenzo, Salta', ['shopping_mall']),
      ],
    };
  }

  if (lower.includes('ceferino') && lower.includes('plaza')) {
    return {
      suggestions: [
        makePred('google-plaza-ceferino', 'Plaza Ceferino', 'Barrio Don Ceferino, Salta', ['park']),
      ],
    };
  }

  if (lower.includes('hiperlibertad') || lower.includes('hiper libertad') || lower.includes('hiperlibert')) {
    return {
      suggestions: [
        makePred('google-hiper-libertad-paseo', 'Hiper Libertad - Libertad SA', 'Batalla de Suipacha, Salta', ['supermarket']),
        makePred('google-el-balcon-paseo', 'El Balcón - Paseo Libertad Salta', 'Avenida Ex Combatientes de Malvinas, Salta', ['restaurant']),
        makePred('google-hiper-libertad-sabattini', 'Hiper Libertad', 'Avenida Amadeo Sabattini, Salta', ['supermarket']),
        makePred('google-paseo-salta', 'Paseo Salta', 'Salta, Argentina', ['shopping_mall']),
        makePred('google-la-anonima-paseo', 'La Anónima', 'Scalabrini Ortiz Norte, Salta', ['supermarket']),
      ],
    };
  }

  if (lower.includes('emprendedor')) {
    return {
      suggestions: [
        makePred(
          'google-escuela-emprendedores',
          'Escuela de Emprendedores Salta',
          'Avenida Independencia, Salta',
          ['school'],
        ),
      ],
    };
  }

  if (lower.includes('incaa') || (lower.includes('hogar') && lower.includes('escuela'))) {
    return {
      suggestions: [
        makePred(
          'google-incaa-hogar-escuela',
          'Espacio INCAA Hogar Escuela',
          'Avenida Hipólito Yrigoyen, Salta',
          ['school'],
        ),
      ],
    };
  }

  if (lower.includes('axion') || lower.includes('ypf')) {
    return {
      suggestions: [
        makePred('google-axion-salta', 'AXION energy', 'Salta', ['gas_station']),
        makePred('google-axion-rural', 'AXION energy - Octano Srl (La Rural)', 'Avenida Paraguay, Salta', ['gas_station']),
        makePred('google-axion-paseo', 'AXION energy - DEL PASEO', 'Avenida Ex Combatientes de Malvinas, Salta', ['gas_station']),
        makePred('google-ypf-entre-rios', 'YPF', 'Avenida Entre Ríos, Salta', ['gas_station']),
      ],
    };
  }

  if (lower.includes('galvez') && lower.includes('marimon')) {
    return {
      suggestions: [
        makePred('google-intersection-galvez-marimon', 'Juan Galvez y Domingo Marimon', 'Salta', ['route']),
      ],
    };
  }

  if (lower.includes('guemes') || lower.includes('güemes')) {
    return {
      suggestions: [
        makePred(
          'google-guemes-general-200',
          'General Martín Miguel de Güemes 200',
          'Bº El Pilar, Salta',
          ['street_address'],
        ),
        makePred(
          'google-guemes-adolfo-200',
          'Adolfo Güemes 200',
          'Barrio Don Bosco, Salta',
          ['street_address'],
        ),
      ],
    };
  }

  if (lower.includes('entre rios') && /\b200\b/.test(lower)) {
    return {
      suggestions: [
        makePred(
          'google-entre-rios-200',
          'Avenida Entre Ríos 200',
          'Salta, Argentina',
          ['street_address'],
        ),
      ],
    };
  }

  if (lower.includes('bolivia') && /\b200\b/.test(lower)) {
    return {
      suggestions: [
        makePred(
          'google-bolivia-200',
          'Avenida Bolivia 200',
          'Salta, Argentina',
          ['street_address'],
        ),
      ],
    };
  }

  return { suggestions: [] };
}

function googlePlaceDetailsEssentialsResponse(placeId) {
  const id = String(placeId || '').trim();
  if (!id) return null;

  const fixtures = {
    'google-unsa': {
      formattedAddress: 'Universidad Nacional de Salta, Av. Bolivia, Salta, Argentina',
      location: { latitude: -24.735437, longitude: -65.386858 },
      types: ['university', 'point_of_interest'],
    },
    'google-jaraba-poi': {
      formattedAddress: 'Imagenes Jaraba, Pueyrredón, Salta, Argentina',
      location: { latitude: -24.7833423, longitude: -65.406269 },
      types: ['establishment', 'point_of_interest'],
    },
    'google-plaza-ceferino': {
      formattedAddress: 'Plaza Ceferino, Barrio Don Ceferino, Salta, Argentina',
      location: { latitude: -24.8122, longitude: -65.4101 },
      types: ['park', 'point_of_interest'],
    },
    'google-punto-shopping': {
      formattedAddress: 'El Punto Shopping, Av. Finca Yerba Buena 4401, San Lorenzo, Salta, Argentina',
      location: { latitude: -24.7918, longitude: -65.4854 },
      types: ['shopping_mall', 'point_of_interest'],
    },
    'google-francisca-arenales': {
      formattedAddress: 'La Fransisca, Arenales, Salta, Argentina',
      location: { latitude: -24.7704, longitude: -65.4211 },
      types: ['restaurant', 'point_of_interest'],
    },
    'google-el-balcon-paseo': {
      formattedAddress: 'El Balcón - Paseo Libertad Salta, Avenida Ex Combatientes de Malvinas, Salta, Argentina',
      location: { latitude: -24.8321, longitude: -65.4276 },
      types: ['restaurant', 'point_of_interest'],
    },
    'google-hiper-libertad-paseo': {
      formattedAddress: 'Hiper Libertad - Libertad SA, Batalla de Suipacha, Salta, Argentina',
      location: { latitude: -24.8321, longitude: -65.4276 },
      types: ['supermarket', 'point_of_interest'],
    },
    'google-la-anonima-paseo': {
      formattedAddress: 'La Anónima, Scalabrini Ortiz Norte, Salta, Argentina',
      location: { latitude: -24.8321, longitude: -65.4276 },
      types: ['supermarket', 'point_of_interest'],
    },
    'google-axion-rural': {
      formattedAddress: 'AXION energy - Octano Srl (La Rural), Avenida Paraguay, Salta, Argentina',
      location: { latitude: -24.8130, longitude: -65.4235 },
      types: ['gas_station', 'point_of_interest'],
    },
    'google-axion-paseo': {
      formattedAddress: 'AXION energy - DEL PASEO, Avenida Ex Combatientes de Malvinas, Salta, Argentina',
      location: { latitude: -24.8304, longitude: -65.4309 },
      types: ['gas_station', 'point_of_interest'],
    },
    'google-ypf-entre-rios': {
      formattedAddress: 'YPF, Avenida Entre Ríos, Salta, Argentina',
      location: { latitude: -24.7797, longitude: -65.4292 },
      types: ['gas_station', 'point_of_interest'],
    },
    'google-guemes-general-200': {
      formattedAddress: 'General Martín Miguel de Güemes 200, Bº El Pilar, Salta, Argentina',
      location: { latitude: -24.7812, longitude: -65.4156 },
      types: ['street_address'],
    },
    'google-guemes-adolfo-200': {
      formattedAddress: 'Adolfo Güemes 200, Barrio Don Bosco, Salta, Argentina',
      location: { latitude: -24.7923, longitude: -65.4089 },
      types: ['street_address'],
    },
    'google-entre-rios-200': {
      formattedAddress: 'Avenida Entre Ríos 200, Salta, Argentina',
      location: { latitude: -24.7797, longitude: -65.4292 },
      types: ['street_address'],
    },
    'google-bolivia-200': {
      formattedAddress: 'Avenida Bolivia 200, Salta, Argentina',
      location: { latitude: -24.7850, longitude: -65.4100 },
      types: ['street_address'],
    },
    'google-intersection-galvez-marimon': {
      formattedAddress: 'Juan Galvez y Domingo Marimon, Salta, Argentina',
      location: { latitude: -24.7954063, longitude: -65.3774346 },
      types: ['route'],
    },
    'google-escuela-emprendedores': {
      formattedAddress: 'Escuela de Emprendedores Salta, Avenida Independencia 910, Salta, Argentina',
      location: { latitude: -24.7985777, longitude: -65.4162771 },
      types: ['school', 'point_of_interest'],
    },
    'ChIJXeY5zbjDG5QRsstuzg8yVow': {
      formattedAddress: 'Escuela Normal de Maestras General Manuel Belgrano, Bartolomé Mitre, Salta, Argentina',
      location: { latitude: -24.78048, longitude: -65.410809 },
      types: ['school', 'point_of_interest'],
    },
    'ChIJU-J5iy7DG5QRces48wzsYl8': {
      formattedAddress: 'Espacio INCAA Hogar Escuela, Avenida Hipólito Yrigoyen, Salta, Argentina',
      location: { latitude: -24.7965187, longitude: -65.4006911 },
      types: ['school', 'point_of_interest'],
    },
  };

  const fixture = fixtures[id];
  if (!fixture) {
    return {
      id,
      formattedAddress: `Lugar de prueba ${id}, Salta, Argentina`,
      location: { latitude: -24.7829, longitude: -65.4122 },
      types: ['point_of_interest'],
    };
  }

  return { id, ...fixture };
}

function googlePlaceIdsOnlyResponse(placeId) {
  const id = String(placeId || '').trim();
  if (!id) return null;
  return { id };
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

    if (urlStr.includes('apis.datos.gob.ar/georef')) {
      const params = parseUrlParams(urlStr);
      const query = String(params.get('direccion') || '').toLowerCase();
      if (query.includes('entre') && query.includes('200')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            direcciones: [{
              nomenclatura: 'AV ENTRE RIOS 200, Salta, Capital, Salta',
              altura: { valor: 200 },
              calle: { nombre: 'AV ENTRE RIOS' },
              localidad_censal: { nombre: 'Salta' },
              provincia: { nombre: 'Salta' },
              ubicacion: { lat: -24.781482624, lon: -65.404901193 },
            }],
          }),
        };
      }
      if (query.includes('bolivia') && query.includes('200')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            direcciones: [{
              nomenclatura: 'AV BOLIVIA 200, Salta, Capital, Salta',
              altura: { valor: 200 },
              calle: { nombre: 'AV BOLIVIA' },
              localidad_censal: { nombre: 'Salta' },
              provincia: { nombre: 'Salta' },
              ubicacion: { lat: -24.7821, lon: -65.4012 },
            }],
          }),
        };
      }
    }

    if (urlStr.includes('nominatim') && urlStr.includes('/lookup')) {
      const params = parseUrlParams(urlStr);
      const osmIds = String(params.get('osm_ids') || '');

      if (osmIds.includes('900001')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([{
            lat: '-24.7954063',
            lon: '-65.3774346',
            geojson: {
              type: 'LineString',
              coordinates: [
                [-65.3785, -24.7962],
                [-65.3760, -24.7945],
              ],
            },
          }]),
        };
      }

      if (osmIds.includes('900002')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([{
            lat: '-24.7954063',
            lon: '-65.3774346',
            geojson: {
              type: 'LineString',
              coordinates: [
                [-65.3778, -24.7940],
                [-65.3770, -24.7968],
              ],
            },
          }]),
        };
      }
    }

    if (urlStr.includes('nominatim') && urlStr.includes('/search')) {
      const params = parseUrlParams(urlStr);
      const query = String(params.get('q') || '').toLowerCase();

      if (
        query.includes('independencia')
        && (query.includes('910') || query.includes('emprendedor'))
      ) {
        return {
          ok: true,
          status: 200,
          json: async () => ([{
            lat: '-24.7985777',
            lon: '-65.4162771',
            display_name: '910, Avenida Independencia, Salta, Argentina',
            place_id: 'test-independencia-910',
            importance: 0.9,
            class: 'place',
            type: 'house',
            name: '',
            address: {
              house_number: '910',
              road: 'Avenida Independencia',
              city: 'Salta',
            },
          }]),
        };
      }

      if (query.includes('emprendedor') && !query.includes('910')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([{
            lat: '-24.82919',
            lon: '-65.42161',
            display_name: 'Escuela de Emprendedores, Avenida Paraguay, Salta, Argentina',
            place_id: 'test-emprendedores-wrong',
            importance: 0.75,
            class: 'amenity',
            type: 'school',
            name: 'Escuela de Emprendedores',
            address: { road: 'Avenida Paraguay', city: 'Salta' },
          }]),
        };
      }

      if (query.includes('escuela normal')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([{
            lat: '-24.78048',
            lon: '-65.410809',
            display_name: 'Escuela Normal, Bartolomé Mitre, Salta, Argentina',
            place_id: 'test-escuela-normal',
            importance: 0.88,
            class: 'amenity',
            type: 'school',
            name: 'Escuela Normal',
            address: { road: 'Bartolomé Mitre', city: 'Salta' },
          }]),
        };
      }

      if (
        query.includes('4660')
        || query.includes('carmen puch')
        || (query.includes('incaa') && query.includes('yrigoyen'))
        || (query.includes('escuela hogar') && query.includes('yrigoyen'))
      ) {
        return {
          ok: true,
          status: 200,
          json: async () => ([{
            lat: '-24.7965187',
            lon: '-65.4006911',
            display_name: 'Escuela Hogar N° 4660 Carmen Puch de Güemes, Avenida Hipólito Yrigoyen, Salta, Argentina',
            place_id: 'test-incaa-hogar-escuela',
            importance: 0.88,
            class: 'amenity',
            type: 'school',
            name: 'Escuela Hogar N° 4660 Carmen Puch de Güemes',
            address: { road: 'Avenida Hipólito Yrigoyen', city: 'Salta' },
          }]),
        };
      }

      if (query.includes('unsa') || query.includes('universidad nacional de salta')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([{
            lat: '-24.735437',
            lon: '-65.386858',
            display_name: 'Universidad Nacional de Salta, Av. Bolivia, Salta, Argentina',
            place_id: 'test-unsa',
            importance: 0.94,
            class: 'amenity',
            type: 'university',
            name: 'Universidad Nacional de Salta',
            address: { road: 'Av. Bolivia', city: 'Salta' },
          }]),
        };
      }

      if (query.includes('alto noa')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([{
            lat: '-24.7620',
            lon: '-65.3890',
            display_name: 'Alto NOA Shopping, Av. del Bicentenario, Salta, Argentina',
            place_id: 'test-alto-noa',
            importance: 0.88,
            class: 'amenity',
            type: 'mall',
            name: 'Alto NOA Shopping',
            address: { road: 'Av. del Bicentenario', city: 'Salta' },
          }]),
        };
      }

      if (query.includes('alto palermo') || query.includes('palermo')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([{
            lat: '-24.7910',
            lon: '-65.4050',
            display_name: 'Alto Palermo Salta, Buenos Aires, Salta, Argentina',
            place_id: 'test-alto-palermo',
            importance: 0.86,
            class: 'amenity',
            type: 'mall',
            name: 'Alto Palermo Salta',
            address: { road: 'Buenos Aires', city: 'Salta' },
          }]),
        };
      }

      if (query.includes('centro comercial') || query.includes('shopping mall')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([{
            lat: '-24.7680',
            lon: '-65.4150',
            display_name: 'Centro Comercial Del Norte, Salta, Argentina',
            place_id: 'test-cc-del-norte',
            importance: 0.82,
            class: 'amenity',
            type: 'mall',
            name: 'Centro Comercial Del Norte',
            address: { city: 'Salta' },
          }]),
        };
      }

      if (query.includes('shopping') || query.includes('shoping')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([{
            lat: '-24.7935',
            lon: '-65.4145',
            display_name: 'Shopping Salta, Bº El Pilar, Salta, Argentina',
            place_id: 'test-shopping-salta',
            importance: 0.91,
            class: 'amenity',
            type: 'mall',
            name: 'Shopping Salta',
            address: { suburb: 'Bº El Pilar', city: 'Salta' },
          }]),
        };
      }

      if (
        (query.includes('arenal') || query.includes('arenales'))
        && query.includes('1819')
      ) {
        return {
          ok: true,
          status: 200,
          json: async () => ([
            {
              lat: '-24.7703902',
              lon: '-65.4211038',
              display_name: '1819, General Juan Antonio Álvarez de Arenales, Salta, Capital, Salta, 4400, Argentina',
              place_id: 'test-francisca-arenales',
              importance: 0.86,
              class: 'place',
              type: 'house',
              name: '',
              address: {
                house_number: '1819',
                road: 'General Juan Antonio Álvarez de Arenales',
                city: 'Salta',
              },
            },
          ]),
        };
      }

      if (query.includes('plaza') && query.includes('ceferino')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([
            {
              lat: '-24.8122423',
              lon: '-65.4100744',
              display_name: 'Plaza Ceferino, Barrio Don Ceferino, Salta, Capital, Salta, Argentina',
              place_id: 'test-plaza-ceferino',
              importance: 0.9,
              class: 'leisure',
              type: 'park',
              name: 'Plaza Ceferino',
              address: { suburb: 'Barrio Don Ceferino', city: 'Salta' },
            },
            {
              lat: '-24.7892510',
              lon: '-65.4102643',
              display_name: 'Plaza 9 de Julio, Salta, Capital, Salta, Argentina',
              place_id: 'test-plaza-9-julio',
              importance: 0.7,
              class: 'leisure',
              type: 'park',
              name: 'Plaza 9 de Julio',
              address: { city: 'Salta' },
            },
          ]),
        };
      }

      if (
        (query.includes('finca') || query.includes('yerba'))
        && query.includes('4401')
      ) {
        return {
          ok: true,
          status: 200,
          json: async () => ([
            {
              lat: '-24.7918132',
              lon: '-65.4853594',
              display_name: '4401, Avenida Finca Yerba Buena, San Lorenzo Chico, San Lorenzo, Salta, Argentina',
              place_id: 'test-punto-shopping-yerba-buena',
              importance: 0.88,
              class: 'place',
              type: 'house',
              name: '',
              address: {
                house_number: '4401',
                road: 'Avenida Finca Yerba Buena',
                city: 'San Lorenzo',
              },
            },
          ]),
        };
      }

      if (
        (query.includes('paseo libertad')
          || query.includes('paseo salta')
          || (query.includes('tavella') && query.includes('1'))
          || query.includes('rotonda') && query.includes('limache'))
      ) {
        return {
          ok: true,
          status: 200,
          json: async () => ([
            {
              lat: '-24.8321075',
              lon: '-65.4276047',
              display_name: 'Paseo Libertad, 1, Avenida Monseñor Roberto José Tavella, Bº Parque La Vega, Salta, Argentina',
              place_id: 'test-paseo-libertad',
              importance: 0.9,
              class: 'place',
              type: 'house',
              name: 'Paseo Libertad',
              address: {
                house_number: '1',
                road: 'Avenida Monseñor Roberto José Tavella',
                city: 'Salta',
              },
            },
          ]),
        };
      }

      if (query.includes('axion')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([
            {
              lat: '-24.8130113',
              lon: '-65.4235226',
              display_name: 'Axion, Avenida José Evaristo Contreras, Bº Casino, Salta, Argentina',
              place_id: 'test-axion-contreras',
              importance: 0.88,
              class: 'amenity',
              type: 'fuel',
              name: 'Axion',
              address: { road: 'Avenida José Evaristo Contreras', suburb: 'Bº Casino', city: 'Salta' },
            },
            {
              lat: '-24.8303796',
              lon: '-65.4308564',
              display_name: 'Axion, Rotonda de Limache, Bº Parque La Vega, Salta, Argentina',
              place_id: 'test-axion-limache',
              importance: 0.86,
              class: 'amenity',
              type: 'fuel',
              name: 'Axion',
              address: { road: 'Rotonda de Limache', suburb: 'Bº Parque La Vega', city: 'Salta' },
            },
          ]),
        };
      }

      if (query.includes('ypf')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([
            {
              lat: '-24.7796987',
              lon: '-65.4291515',
              display_name: 'YPF, 1958, Avenida Entre Ríos, Barrio Don Bosco, Salta, Argentina',
              place_id: 'test-ypf-entre-rios',
              importance: 0.9,
              class: 'amenity',
              type: 'fuel',
              name: 'YPF',
              address: { road: 'Avenida Entre Ríos', house_number: '1958', city: 'Salta' },
            },
            {
              lat: '-24.8079130',
              lon: '-65.4056000',
              display_name: 'YPF, Salta, Capital, Salta, Argentina',
              place_id: 'test-ypf-generic',
              importance: 0.7,
              class: 'amenity',
              type: 'fuel',
              name: 'YPF',
              address: { city: 'Salta' },
            },
          ]),
        };
      }

      if (query.includes('paraguay')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([
            {
              lat: '-24.8161437',
              lon: '-65.4244188',
              display_name: 'Avenida Paraguay, Bº Casino, Salta, Argentina',
              place_id: 'test-paraguay-street',
              importance: 0.75,
              class: 'highway',
              type: 'primary',
              name: 'Avenida Paraguay',
              osm_type: 'way',
              osm_id: 'test-paraguay-way',
              address: { road: 'Avenida Paraguay', suburb: 'Bº Casino', city: 'Salta' },
            },
          ]),
        };
      }

      if (query.includes('galvez') || query.includes('gálvez')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([
            {
              lat: '-24.7928981',
              lon: '-65.3760542',
              display_name: 'Juan Gálvez, Salta, Capital, Salta, Argentina',
              place_id: 'test-galvez-street',
              importance: 0.86,
              class: 'highway',
              type: 'residential',
              name: 'Juan Gálvez',
              osm_type: 'way',
              osm_id: '900001',
              address: { road: 'Juan Gálvez', city: 'Salta' },
            },
          ]),
        };
      }

      if (query.includes('marimon') || query.includes('marimón')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([
            {
              lat: '-24.7954958',
              lon: '-65.3750417',
              display_name: 'Domingo Marimón, Salta, Capital, Salta, Argentina',
              place_id: 'test-marimon-street',
              importance: 0.86,
              class: 'highway',
              type: 'residential',
              name: 'Domingo Marimón',
              osm_type: 'way',
              osm_id: '900002',
              address: { road: 'Domingo Marimón', city: 'Salta' },
            },
          ]),
        };
      }

      if (
        (query.includes('pueyrredon') || query.includes('pueyrredón'))
        && query.includes('550')
      ) {
        return {
          ok: true,
          status: 200,
          json: async () => ([
            {
              lat: '-24.7833423',
              lon: '-65.4062690',
              display_name: '550, Juan Martín de Pueyrredón, Bº El Pilar, Salta, Capital, Salta, 4400, Argentina',
              place_id: 'test-jaraba-pueyrredon-550',
              importance: 0.85,
              class: 'place',
              type: 'house',
              name: '',
              address: {
                house_number: '550',
                road: 'Juan Martín de Pueyrredón',
                city: 'Salta',
              },
            },
          ]),
        };
      }

      if (query.includes('jaraba') || query.includes('imagenes')) {
        return {
          ok: true,
          status: 200,
          json: async () => ([
            {
              lat: '-24.7912',
              lon: '-65.4105',
              display_name: 'Imagenes Jaraba, Pueyrredón, Salta, Argentina',
              place_id: 'test-jaraba-poi',
              importance: 0.88,
              class: 'amenity',
              type: 'studio',
              name: 'Imagenes Jaraba',
              address: { road: 'Pueyrredón', city: 'Salta' },
            },
            {
              lat: '-24.7890',
              lon: '-65.4110',
              display_name: 'Juan Martín de Pueyrredón, Bº El Pilar, Salta, Capital, Salta, A4400ABL, Argentina',
              place_id: 'test-pueyrredon-street',
              importance: 0.72,
              class: 'highway',
              type: 'residential',
              address: { road: 'Juan Martín de Pueyrredón', city: 'Salta' },
            },
          ]),
        };
      }

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

    if (urlStr.includes('places.googleapis.com/v1/places:autocomplete')) {
      let input = '';
      try {
        const body = typeof options?.body === 'string' ? JSON.parse(options.body) : (options?.body || {});
        input = body.input || '';
      } catch {
        input = '';
      }
      return {
        ok: true,
        status: 200,
        json: async () => googleAutocompleteResponse(input),
      };
    }

    if (urlStr.includes('places.googleapis.com/v1/places/')) {
      const placeId = decodeURIComponent(urlStr.split('/places/')[1]?.split('?')[0] || '');
      const fieldMask = String(options?.headers?.['X-Goog-FieldMask'] || '');
      if (fieldMask.includes('location')) {
        const payload = googlePlaceDetailsEssentialsResponse(placeId);
        if (!payload) {
          return { ok: false, status: 404, json: async () => ({ error: { code: 404 } }) };
        }
        return { ok: true, status: 200, json: async () => payload };
      }

      const payload = googlePlaceIdsOnlyResponse(placeId);
      if (!payload) {
        return { ok: false, status: 404, json: async () => ({ error: { code: 404 } }) };
      }
      return { ok: true, status: 200, json: async () => payload };
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
