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
  // ── Transporte ────────────────────────────────────────────────────────────
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
    id: 'aeropuerto',
    label: 'Aeropuerto de Salta',
    geocodeQuery: 'Aeropuerto Internacional Martín Miguel de Güemes, Salta, Argentina',
    patterns: [/\b(el\s+)?aeropuerto\b/, /\baeropuerto\s+(de\s+)?salta\b/],
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

  // ── Hospitales / Salud ────────────────────────────────────────────────────
  {
    id: 'hospital',
    label: 'Hospital San Bernardo',
    geocodeQuery: 'Hospital San Bernardo, Salta, Argentina',
    alternateGeocodeQueries: ['Hospital San Bernardo Salta', 'Sanatorio San Bernardo Salta'],
    patterns: [
      /\bhospital\s+san\s+bernardo\b/,
      /\bsan\s+bernardo\b/,
    ],
  },
  {
    id: 'hospital_senor_milagro',
    label: 'Hospital Señor del Milagro',
    geocodeQuery: 'Hospital Señor del Milagro, Salta, Argentina',
    patterns: [
      /\bhospital\s+se(ñ|n)or\s+del\s+milagro\b/,
      /\bse(ñ|n)or\s+del\s+milagro\b/,
      /\bmilagro\b/,
    ],
  },
  {
    id: 'hospital_materno',
    label: 'Hospital Público Materno Infantil',
    geocodeQuery: 'Hospital Público Materno Infantil, Salta, Argentina',
    patterns: [
      /\bmaterno\s+infantil\b/,
      /\bhospital\s+materno\b/,
      /\bmaternidad\b/,
    ],
  },
  {
    id: 'hospital_papa_francisco',
    label: 'Hospital Papa Francisco',
    geocodeQuery: 'Hospital Papa Francisco, Salta, Argentina',
    patterns: [
      /\bhospital\s+papa\s+francisco\b/,
      /\bpapa\s+francisco\b/,
    ],
  },
  {
    id: 'hospital_militar',
    label: 'Hospital Militar',
    geocodeQuery: 'Hospital Militar, Salta, Argentina',
    patterns: [/\bhospital\s+militar\b/, /\bmilitar\b/],
  },
  {
    id: 'hospital_tres_cerritos',
    label: 'Hospital Privado Tres Cerritos',
    geocodeQuery: 'Hospital Privado Tres Cerritos, Salta, Argentina',
    patterns: [
      /\btres\s+cerritos\b/,
      /\bhospital\s+privado\s+tres\s+cerritos\b/,
    ],
  },
  {
    id: 'hospital_ragone',
    label: 'Hospital de Salud Mental Miguel Ragone',
    geocodeQuery: 'Hospital de Salud Mental Miguel Ragone, Salta, Argentina',
    patterns: [/\bragone\b/, /\bsalud\s+mental\s+ragone\b/],
  },
  {
    id: 'hospital_oñativia',
    label: 'Hospital Dr. Arturo Oñativia',
    geocodeQuery: 'Hospital De Endocrinologia Y Metabolismo Dr Arturo Oñativia, Salta, Argentina',
    patterns: [/\bo(ñ|n)ativia\b/, /\bendocrinolog(i|í)a\b/],
  },
  {
    id: 'clinica_santa_clara',
    label: 'Clínica Santa Clara de Asís',
    geocodeQuery: 'Clínica Santa Clara de Asís, Salta, Argentina',
    alternateGeocodeQueries: ['Fundación Santa Clara de Asís Salta'],
    patterns: [
      /\bclinica\s+santa\s+clara\b/,
      /\bsanta\s+clara\s+de\s+asis\b/,
    ],
  },
  {
    id: 'sanatorio_el_carmen',
    label: 'Sanatorio El Carmen',
    geocodeQuery: 'Sanatorio El Carmen, Salta, Argentina',
    patterns: [/\bsanatorio\s+el\s+carmen\b/, /\bel\s+carmen\b/],
  },
  {
    id: 'emergencia_pediatrica',
    label: 'Emergencia Pediátrica',
    geocodeQuery: 'Emergencia Pediatrica, Salta, Argentina',
    patterns: [/\bemergencia\s+pediatrica\b/, /\bpediatrica\b/],
  },
  {
    id: 'apass',
    label: 'APASS',
    geocodeQuery: 'APASS Sanatorio, Salta, Argentina',
    patterns: [/\bapass\b/, /\bsanatorio\s+apass\b/],
  },

  // ── Universidades / Educación ─────────────────────────────────────────────
  {
    id: 'unsa',
    label: 'Universidad Nacional de Salta (UNSa)',
    geocodeQuery: 'Universidad Nacional de Salta, Salta, Argentina',
    alternateGeocodeQueries: [
      'UNSa Salta',
      'Facultad de Ciencias Naturales UNSA',
      'Universidad Nacional de Salta - Campo General San Martín',
    ],
    patterns: [
      /\bunsa\b/,
      /\buniversidad\s+nacional\s+de\s+salta\b/,
      /\bu\.?\s*n\.?\s*s\.?\s*a\.?\b/,
      /\bciudad\s+universitaria\b/,
    ],
  },
  {
    id: 'ucasal',
    label: 'Universidad Católica de Salta (UCASAL)',
    geocodeQuery: 'Universidad Católica de Salta, Salta, Argentina',
    alternateGeocodeQueries: ['UCASAL Salta'],
    patterns: [
      /\bucasal\b/,
      /\buniversidad\s+cat(o|ó)lica\s+de\s+salta\b/,
      /\bu\.?\s*c\.?\s*a\.?\s*s\.?\s*a\.?\s*l\.?\b/,
    ],
  },
  {
    id: 'universidad_siglo21',
    label: 'Universidad Siglo 21',
    geocodeQuery: 'Universidad Siglo 21, Salta, Argentina',
    patterns: [
      /\bsiglo\s+21\b/,
      /\buniversidad\s+siglo\s+21\b/,
    ],
  },

  // ── Estadios / Deportes ───────────────────────────────────────────────────
  {
    id: 'estadio_martearena',
    label: 'Estadio Padre Ernesto Martearena',
    geocodeQuery: 'Estadio Padre Ernesto Martearena, Salta, Argentina',
    patterns: [
      /\bmartearena\b/,
      /\bestadio\s+padre\s+ernesto\s+martearena\b/,
      /\bestadio\s+(de\s+)?salta\b/,
    ],
  },
  {
    id: 'estadio_gigante_norte',
    label: 'El Gigante del Norte (Estadio CAN)',
    geocodeQuery: 'El Gigante del Norte, Salta, Argentina',
    alternateGeocodeQueries: ['Club Atletico San Martín Salta', 'Estadio San Martin Salta'],
    patterns: [
      /\bgigante\s+del\s+norte\b/,
      /\bcan\b/,
      /\bclub\s+atletico\s+san\s+martin\b/,
    ],
  },
  {
    id: 'estadio_central_norte',
    label: 'Club Central Norte',
    geocodeQuery: 'Club Central Norte, Salta, Argentina',
    patterns: [
      /\bcentral\s+norte\b/,
      /\bclub\s+central\s+norte\b/,
    ],
  },
  {
    id: 'estadio_julio_caceres',
    label: 'Estadio Julio Cáceres (Juventud Antoniana)',
    geocodeQuery: 'Estadio Julio Caceres Salta, Argentina',
    alternateGeocodeQueries: ['Juventud Antoniana Salta'],
    patterns: [
      /\bjulio\s+c(a|á)ceres\b/,
      /\bantoni(a|ana)\b/,
      /\bjuventud\s+antoniana\b/,
    ],
  },

  // ── Mercados / Ferias ─────────────────────────────────────────────────────
  {
    id: 'mercado_san_miguel',
    label: 'Mercado San Miguel',
    geocodeQuery: 'Mercado San Miguel, Salta, Argentina',
    alternateGeocodeQueries: ['Mercado Municipal San Miguel Salta'],
    patterns: [
      /\bmercado\s+san\s+miguel\b/,
      /\bsan\s+miguel\b/,
    ],
  },
  {
    id: 'mercado_artesanal',
    label: 'Mercado Artesanal',
    geocodeQuery: 'Mercado Artesanal, Salta, Argentina',
    patterns: [
      /\bmercado\s+artesanal\b/,
      /\bartesanal\b/,
    ],
  },
  {
    id: 'mercado_evita',
    label: 'Mercado Evita',
    geocodeQuery: 'Mercado Evita, Salta, Argentina',
    patterns: [/\bmercado\s+evita\b/],
  },
  {
    id: 'feria_balcarce',
    label: 'Paseo Balcarce',
    geocodeQuery: 'Paseo Balcarce, Salta, Argentina',
    alternateGeocodeQueries: ['Feria Balcarce Salta'],
    patterns: [
      /\bbalcarce\b/,
      /\bpaseo\s+balcarce\b/,
      /\bferia\s+balcarce\b/,
    ],
  },

  // ── Museos / Cultura ──────────────────────────────────────────────────────
  {
    id: 'maam',
    label: 'Museo de Arqueología de Alta Montaña (MAAM)',
    geocodeQuery: 'Museo de Arqueología de Alta Montaña, Salta, Argentina',
    patterns: [
      /\bmaam\b/,
      /\bmusel?\s+de\s+arqueolog(i|í)a\b/,
      /\balta\s+monta(n|ñ)a\b/,
    ],
  },
  {
    id: 'museo_bellas_artes',
    label: 'Museo de Bellas Artes',
    geocodeQuery: 'Museo de Bellas Artes, Salta, Argentina',
    patterns: [
      /\bbellas\s+artes\b/,
      /\bmuseo\s+de\s+bellas\s+artes\b/,
    ],
  },
  {
    id: 'museo_guemes',
    label: 'Museo de Güemes',
    geocodeQuery: 'Museo de Güemes, Salta, Argentina',
    patterns: [
      /\bmuseo\s+de\s+g(u|ü)emes\b/,
      /\bmuseo\s+g(u|ü)emes\b/,
    ],
  },
  {
    id: 'cabildo',
    label: 'Cabildo de Salta',
    geocodeQuery: 'Cabildo de Salta, Salta, Argentina',
    patterns: [/\bcabildo\b/],
  },
  {
    id: 'museo_ciencias_naturales',
    label: 'Museo de Ciencias Naturales',
    geocodeQuery: 'Museo de Ciencias Naturales, Salta, Argentina',
    patterns: [
      /\bciencias\s+naturales\b/,
      /\bmuseo\s+de\s+ciencias\s+naturales\b/,
    ],
  },

  // ── Lugares / Esparcimiento ───────────────────────────────────────────────
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
    id: 'cementerio',
    label: 'Cementerio de la Santa Cruz',
    geocodeQuery: 'Cementerio de la Santa Cruz, Salta, Argentina',
    patterns: [/\b(el\s+)?cementerio\b/],
  },
  {
    id: 'parque_san_martin',
    label: 'Parque San Martín',
    geocodeQuery: 'Parque San Martín, Salta, Argentina',
    patterns: [
      /\bparque\s+san\s+mart(i|í)n\b/,
      /\bparque\b/,
    ],
  },
  {
    id: 'cerro_san_bernardo',
    label: 'Cerro San Bernardo',
    geocodeQuery: 'Cerro San Bernardo, Salta, Argentina',
    alternateGeocodeQueries: ['Teleférico Salta'],
    patterns: [
      /\bcerro\s+san\s+bernardo\b/,
      /\btelef(e|é)rico\b/,
      /\bcerro\b/,
    ],
  },

  // ── Comercios / Servicios ─────────────────────────────────────────────────
  {
    id: 'shopping',
    label: 'Shopping Salta',
    geocodeQuery: 'Shopping Salta, Salta, Argentina',
    alternateGeocodeQueries: [
      'Alto Palermo Salta',
      'Shopping Alto Palermo Salta',
      'Alto NOA Shopping Salta',
      'Centro Comercial Del Norte Salta',
      'Paseo San Cayetano Salta',
    ],
    patterns: [
      /\b(el\s+)?shopping(?:\s+salta)?\b/,
      /\bshopping\s+salta\b/,
      /\bnuevo\s+centro\s+shopping\b/,
      /\bcentro\s+comercial\s+shopping\b/,
      /\balto\s+noa\b/,
    ],
  },
  {
    id: 'carrefour',
    label: 'Carrefour Salta',
    geocodeQuery: 'Carrefour, Salta, Argentina',
    patterns: [/\bcarrefour\b/],
  },
  {
    id: 'macro',
    label: 'Banco Macro',
    geocodeQuery: 'Banco Macro, Salta, Argentina',
    patterns: [/\bmacro\b/, /\bbanco\s+macro\b/],
  },

  // ── Gobierno / Servicios públicos ─────────────────────────────────────────
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
];

const POI_KEYWORD_RE =
  /\b(hospital|terminal|shopping|aeropuerto|catedral|plaza|casino|estacion|cementerio|sanatorio|apass|banco|farmacia|supermercado|colegio|escuela|universidad|unsa|ucasal|municipalidad|correo|edificio|oficina|galeria|centro\s+comercial|nuevo\s+centro|macro|carrefour|walmart|hiper|tren|estadio|mercado|feria|museo|cabildo|parque|cerro|telef[eé]rico|balcarce|martearena|milagro|materno|militarr|pediatric[ao]|maam|bellas\s+artes|ciencias\s+naturales|siglo\s+21|gigante|antoniana|san\s+bernardo|san\s+miguel|artesanal)\b/;

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

/** Varias consultas Nominatim para autocomplete de POIs (typos + alternativas + categoría). */
function buildPoiAutocompleteQueries(value) {
  const raw = String(value || '').trim();
  const norm = fixPoiTypoTokens(normalizePoiText(value));
  const queries = [];
  const seen = new Set();
  const add = (q) => {
    const text = String(q || '').trim();
    if (text.length < 3) return;
    const key = normalizePoiText(text);
    if (seen.has(key)) return;
    seen.add(key);
    queries.push(text);
  };

  add(raw);
  if (norm && norm !== normalizePoiText(raw)) {
    add(norm);
  }

  const known = resolveSaltaKnownPoi(value);
  if (known) {
    for (const q of getKnownPoiSearchQueries(known)) {
      add(q);
    }
  }

  if (/\bshopping\b/.test(norm)) {
    add('centro comercial Salta');
    add('shopping mall Salta');
    add('Alto NOA Shopping Salta');
  }
  if (/\bterminal\b/.test(norm)) {
    add('terminal de omnibus Salta');
  }
  if (/\bhospital\b/.test(norm)) {
    add('hospital Salta');
  }
  if (/\bunsa\b/.test(norm) || /\buniversidad\b/.test(norm)) {
    add('universidad Salta');
  }
  if (/\bestadio\b/.test(norm) || /\bmartearena\b/.test(norm)) {
    add('estadio Salta');
  }
  if (/\bmercado\b/.test(norm)) {
    add('mercado Salta');
  }
  if (/\bmuseo\b/.test(norm)) {
    add('museo Salta');
  }
  if (/\bbalcarce\b/.test(norm)) {
    add('Paseo Balcarce Salta');
  }
  if (/\bcerro\b/.test(norm) || /\btelef/.test(norm)) {
    add('Cerro San Bernardo Salta');
  }
  if (/\bparque\b/.test(norm)) {
    add('Parque San Martín Salta');
  }

  return queries;
}

module.exports = {
  resolveSaltaKnownPoi,
  looksLikeSaltaKnownPoi,
  getKnownPoiSearchQueries,
  buildPoiAutocompleteQueries,
  normalizePoiText,
  fixPoiTypoTokens,
};
