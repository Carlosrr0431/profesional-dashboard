/**
 * POIs conocidos de Salta Capital — detección coloquial, typos y nombre canónico para geocodificar.
 * Compartido entre passenger-app y profesional-dashboard.
 */

function normalizePoiText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Corrige errores de tipeo frecuentes en nombres de lugares. */
function fixPoiTypoTokens(norm) {
  return String(norm || '')
    .replace(/\bterminalk\b/g, 'terminal')
    .replace(/\bterminak\b/g, 'terminal')
    .replace(/\btermnal\b/g, 'terminal')
    .replace(/\btermina+l\b/g, 'terminal')
    .replace(/\bshoping\b/g, 'shopping')
    .replace(/\bshopingk\b/g, 'shopping')
    .replace(/\bshopp?ingk\b/g, 'shopping')
    .replace(/\bhospitak\b/g, 'hospital')
    .replace(/\baeropuertok\b/g, 'aeropuerto')
    .replace(/\bestacionk\b/g, 'estacion')
    .replace(/\bestacion\b/g, 'estacion');
}

const SALTA_KNOWN_POIS = [
  {
    id: 'terminal',
    label: 'Terminal de Ómnibus',
    geocodeQuery: 'Terminal de Ómnibus de Salta, Salta, Argentina',
    alternateGeocodeQueries: [
      'Terminal de Omnibus Salta',
      'Terminal de buses Salta',
      'Estación de ómnibus Salta',
    ],
    patterns: [
      /\b(la\s+)?terminal(?:\s+de\s+(omnibus|buses?))?\b/,
      /\bterminal\s+omnibus\b/,
      /\b(la\s+)?terminal\b/,
    ],
  },
  {
    id: 'shopping',
    label: 'Shopping Salta',
    geocodeQuery: 'Shopping Salta, Salta, Argentina',
    alternateGeocodeQueries: ['Alto Palermo Salta', 'Shopping Alto Palermo Salta'],
    patterns: [
      /\b(el\s+)?shopping(?:\s+salta)?\b/,
      /\bshopping\s+salta\b/,
      /\bnuevo\s+centro\s+shopping\b/,
      /\bcentro\s+comercial\s+shopping\b/,
    ],
  },
  {
    id: 'hospital',
    label: 'Hospital San Bernardo',
    geocodeQuery: 'Hospital San Bernardo, Salta, Argentina',
    alternateGeocodeQueries: ['Hospital San Bernardo Salta', 'Sanatorio San Bernardo Salta'],
    patterns: [
      /\b(el\s+)?hospital(?:\s+san\s+bernardo)?\b/,
      /\bhospital\s+san\s+bernardo\b/,
    ],
  },
  {
    id: 'aeropuerto',
    label: 'Aeropuerto de Salta',
    geocodeQuery: 'Aeropuerto Internacional Martín Miguel de Güemes, Salta, Argentina',
    patterns: [/\b(el\s+)?aeropuerto\b/, /\baeropuerto\s+(de\s+)?salta\b/],
  },
  {
    id: 'plaza',
    label: 'Plaza 9 de Julio',
    geocodeQuery: 'Plaza 9 de Julio, Salta, Argentina',
    patterns: [
      /\b(la\s+)?plaza(?:\s+9\s+de\s+julio|\s+principal)?\b/,
      /\bplaza\s+9\s+de\s+julio\b/,
      /\b(la\s+)?catedral\b/,
    ],
  },
  {
    id: 'casino',
    label: 'Casino Club Salta',
    geocodeQuery: 'Casino Club Salta, Salta, Argentina',
    patterns: [/\b(el\s+)?casino(?:\s+salta)?\b/],
  },
  {
    id: 'tren',
    label: 'Estación de Tren Salta',
    geocodeQuery: 'Estación Salta, Salta, Argentina',
    patterns: [
      /\b(el\s+)?tren\b/,
      /\bestacion\s+de\s+tren\b/,
      /\b(la\s+)?estacion(?:\s+de\s+tren)?\b/,
    ],
  },
  {
    id: 'apass',
    label: 'APASS',
    geocodeQuery: 'APASS Sanatorio, Salta, Argentina',
    patterns: [/\bapass\b/, /\bsanatorio\s+apass\b/],
  },
  {
    id: 'cementerio',
    label: 'Cementerio de la Santa Cruz',
    geocodeQuery: 'Cementerio de la Santa Cruz, Salta, Argentina',
    patterns: [/\b(el\s+)?cementerio\b/],
  },
  {
    id: 'municipalidad',
    label: 'Municipalidad de Salta',
    geocodeQuery: 'Municipalidad de la Ciudad de Salta, Salta, Argentina',
    patterns: [/\b(la\s+)?municipalidad\b/],
  },
  {
    id: 'correo',
    label: 'Correo Argentino Salta',
    geocodeQuery: 'Correo Argentino, Salta, Argentina',
    patterns: [/\b(el\s+)?correo\b/],
  },
  {
    id: 'macro',
    label: 'Banco Macro',
    geocodeQuery: 'Banco Macro, Salta, Argentina',
    patterns: [/\bmacro\b/, /\bbanco\s+macro\b/],
  },
  {
    id: 'carrefour',
    label: 'Carrefour Salta',
    geocodeQuery: 'Carrefour, Salta, Argentina',
    patterns: [/\bcarrefour\b/],
  },
  {
    id: 'unsa',
    label: 'Universidad Nacional de Salta (UNSa)',
    geocodeQuery: 'Universidad Nacional de Salta, Salta, Argentina',
    alternateGeocodeQueries: [
      'UNSa Salta',
      'Facultad de Ciencias Naturales UNSA',
    ],
    patterns: [
      /\bunsa\b/,
      /\buniversidad\s+nacional\s+de\s+salta\b/,
      /\bu\.?\s*n\.?\s*s\.?\s*a\.?\b/,
    ],
  },
];

const POI_KEYWORD_RE =
  /\b(hospital|terminal|shopping|aeropuerto|catedral|plaza|casino|estacion|cementerio|sanatorio|apass|banco|farmacia|supermercado|colegio|escuela|universidad|unsa|municipalidad|correo|edificio|oficina|galeria|centro\s+comercial|nuevo\s+centro|macro|carrefour|walmart|hiper|tren)\b/;

function resolveSaltaKnownPoi(value) {
  const norm = fixPoiTypoTokens(normalizePoiText(value));
  if (!norm) return null;

  for (const poi of SALTA_KNOWN_POIS) {
    if (poi.patterns.some((pattern) => pattern.test(norm))) {
      return {
        id: poi.id,
        label: poi.label,
        geocodeQuery: poi.geocodeQuery,
        alternateGeocodeQueries: poi.alternateGeocodeQueries || [],
      };
    }
  }

  return null;
}

function looksLikeSaltaKnownPoi(value) {
  const norm = fixPoiTypoTokens(normalizePoiText(value));
  if (!norm) return false;
  if (resolveSaltaKnownPoi(norm)) return true;
  return POI_KEYWORD_RE.test(norm);
}

function getKnownPoiSearchQueries(poi) {
  if (!poi) return [];
  const seen = new Set();
  const out = [];
  for (const q of [poi.geocodeQuery, ...(poi.alternateGeocodeQueries || [])]) {
    const trimmed = String(q || '').trim();
    if (!trimmed) continue;
    const key = normalizePoiText(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

module.exports = {
  resolveSaltaKnownPoi,
  looksLikeSaltaKnownPoi,
  getKnownPoiSearchQueries,
};
