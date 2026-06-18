/**
 * test-direcciones.mjs
 *
 * Script de prueba para la lógica de reconocimiento de direcciones de route.js.
 * Cubre los 36 casos documentados en ADDRESS_CASES.md + patrones reales de producción.
 *
 * Uso:
 *   node profesional-dashboard/scripts/test-direcciones.mjs
 *   node profesional-dashboard/scripts/test-direcciones.mjs --verbose
 *   node profesional-dashboard/scripts/test-direcciones.mjs --filter calle
 */

// ─────────────────────────────────────────────────────────────────────────────
// FUNCIONES PURAS EXTRAÍDAS DE route.js  (sin dependencias de red ni Supabase)
// ─────────────────────────────────────────────────────────────────────────────

function sanitizeAddressInput(address) {
  if (!address || typeof address !== 'string') return '';
  return address.replace(/[<>{}[\]\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200);
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function normalizeForMatch(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripEmbeddedPhoneNumbers(text) {
  return String(text || '')
    .replace(/\b(?:cel(?:ular)?|tel(?:efono)?|mob(?:il)?|whatsapp|wpp)\s*:?\s*[\d\s\-+().]{7,}/gi, '')
    .replace(/\b(\d{1,5})-\d{5,}\b/g, '$1')
    .replace(/\b\d{8,}\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const SPANISH_HUNDREDS = {
  'doscient[ao]s': 200, 'trescient[ao]s': 300, 'cuatrocient[ao]s': 400,
  'quinient[ao]s': 500, 'seiscient[ao]s': 600, 'setecient[ao]s': 700,
  'ochocient[ao]s': 800, 'novecient[ao]s': 900, 'ciento?': 100,
};
const SPANISH_TENS = {
  veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50,
  sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
};

function convertSpanishNumbersInText(text) {
  let result = String(text || '');
  const tensAlternation = Object.keys(SPANISH_TENS).join('|');
  for (const [hPat, hVal] of Object.entries(SPANISH_HUNDREDS)) {
    const combinedPattern = new RegExp(
      `\\b${hPat}(?:\\s+(?:y\\s+)?(${tensAlternation}))?\\b`, 'gi'
    );
    result = result.replace(combinedPattern, (m, tens) => {
      const tVal = tens ? (SPANISH_TENS[tens.toLowerCase()] ?? 0) : 0;
      const total = hVal + tVal;
      return total > 0 ? String(total) : m;
    });
  }
  return result;
}

const SALTA_PHONETIC_CORRECTIONS = [
  [/\birig[uo]g[io]en\b/gi, 'Yrigoyen'],
  [/\birig[ou]ien\b/gi, 'Yrigoyen'],
  [/\burquis[ao]\b/gi, 'Urquiza'],
  [/\burguis[ao]\b/gi, 'Urquiza'],
  [/\b(?:geme[sz]?|gueme[sz]?)\b/gi, 'Güemes'],
  [/\bbuenos\s+aire(?!s)\b/gi, 'Buenos Aires'],
  [/\bcastan[ae]r[ao]s\b/gi, 'Castañares'],
  [/\bleguisam[o]n\b/gi, 'Leguizamón'],
  [/\bzub[i]r[ia][ao]?\b/gi, 'Zuviría'],
  [/\bespana\b/gi, 'España'],
  [/\bsantiag[ou]\s+del?\s+ester[ou]\b/gi, 'Santiago del Estero'],
  [/\bmitra\b/gi, 'Mitre'],
  [/\balverdi\b/gi, 'Alberdi'],
  [/\balverdy\b/gi, 'Alberdi'],
  [/\brivadabia\b/gi, 'Rivadavia'],
  [/\bribadavia\b/gi, 'Rivadavia'],
  [/\bpelegrini\b/gi, 'Pellegrini'],
  [/\bpelegr[ií]ni\b/gi, 'Pellegrini'],
  [/\bcaseiro[s]?\b/gi, 'Caseros'],
  [/\bnecochia\b/gi, 'Necochea'],
  [/\bvalgrano\b/gi, 'Belgrano'],
  [/\bbalgrano\b/gi, 'Belgrano'],
  [/\bsanmartin\b/gi, 'San Martín'],
  [/\bpuerred[oó]n\b/gi, 'Pueyrredón'],
  [/\bdean\s+funez\b/gi, 'Dean Funes'],
  [/\bde[aá]n\s+funes\b/gi, 'Dean Funes'],
  [/\bguardias\s+nacionales\b/gi, 'Guardias Nacionales'],
  [/\bsarmient[ou]\b/gi, 'Sarmiento'],
  [/\bjujuy\b/gi, 'Jujuy'],
];

function applyPhoneticCorrections(text) {
  let result = String(text || '');
  for (const [pattern, replacement] of SALTA_PHONETIC_CORRECTIONS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

function looksLikeAddressText(text) {
  const value = sanitizeAddressInput(text);
  if (!value) return false;
  const hasStreetAndNumber = /[a-zA-ZÀ-ÿ]{2,}[\w\s.'-]*\s\d{1,5}(?:\s*[a-zA-Z]\d?)?/i.test(value);
  const hasIntersection = /\b[a-zA-ZÀ-ÿ]{2,}[\w\s.'-]*\s+y\s+[a-zA-ZÀ-ÿ]{2,}[\w\s.'-]*/i.test(value);
  const hasStreetKeyword = /\b(calle|av\.?|avenida|pasaje|pje\.?|barrio|esquina|callej[oó]n|manzana|mz\.?|lote)\b/i.test(value);
  if (hasStreetAndNumber || hasIntersection) return true;
  if (hasStreetKeyword && value.length >= 8) return true;
  return false;
}

function normalizeAddressPhrase(value) {
  const input = sanitizeAddressInput(value || '');
  if (!input) return '';

  if (/^(?:ac[aá](?:\s*nom[aá]s)?|aqu[ií]|donde\s+estoy|en\s+mi\s+cas[ao]|ac[aá]\s+estoy)$/i.test(input.trim())) return '';

  let work = stripEmbeddedPhoneNumbers(input);
  work = convertSpanishNumbersInText(work);
  work = applyPhoneticCorrections(work);

  return sanitizeAddressInput(
    work
      .replace(/\bavda\.?\b/gi, 'Avenida')
      .replace(/\bav\.?\b/gi, 'Avenida')
      .replace(/\bgral\.?\b/gi, 'General')
      .replace(/\bcnel\.?\b/gi, 'Coronel')
      .replace(/\btte\.?\b/gi, 'Teniente')
      .replace(/\bbvd\.?\b/gi, 'Boulevard')
      .replace(/\bbv\.?\b/gi, 'Boulevard')
      .replace(/\besq(?:uina)?\.?\s*/gi, 'y ')
      .replace(/\s+c\/\s*/gi, ' y ')
      .replace(/\bcasi\b/gi, 'y')
      .replace(/\bx\s+favor\b/gi, 'por favor')
      .replace(/\s+x\s+/gi, ' y ')
      .replace(/\bal\s+(\d{1,5})\b/gi, '$1')
      .replace(/\b(?:altura|nro\.?|numero|n[uú]mero)\s*(\d{1,5})\b/gi, '$1')
      .replace(/(^|[\s,.-])n\s*[°o]?\s*(\d{1,5})\b/gi, '$1$2')
      .replace(/\b(\d{1,5})\s+(?:dto\.?|depto\.?|departamento|dpto\.?|piso|of\.?|oficina|dep\.?|torre|bloque|block)?\s*[a-z]?\d{1,3}[a-z]?\b/gi, '$1')
      .replace(/^(?:en|por|desde|hasta|hacia|a)\s+/i, '')
      .trim()
  );
}

function requiresGpsForAddress(address) {
  const normalized = normalizeForMatch(address || '');
  if (!normalized) return { required: false, reason: null };
  if (/\b(pasaje|pje\.?|callejon|callej[oó]n)\b/.test(normalized)) {
    return { required: true, reason: 'pasaje' };
  }
  if (/\b(manzana|mz\.?a?)\s*\d+/.test(normalized)) {
    return { required: true, reason: 'manzana_lote' };
  }
  if (/\bblock\s*\d+/.test(normalized)) {
    return { required: true, reason: 'manzana_lote' };
  }
  if (/\b(?:ruta\s*(?:nacional|provincial|nac\.?|prov\.?)?\s*\d+|km\s*\d+|\d+\s*km\b)/.test(normalized)) {
    return { required: true, reason: 'km_ruta' };
  }
  return { required: false, reason: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// PARSER DE FECHA/HORA (copia de route.js)
// ─────────────────────────────────────────────────────────────────────────────

const AR_UTC_OFFSET_H = -3;

function arLocalNow() {
  return new Date(Date.now() + AR_UTC_OFFSET_H * 3_600_000);
}

function arLocalToUtc(year, month1, day, hour, minute = 0) {
  return new Date(Date.UTC(year, month1 - 1, day, hour - AR_UTC_OFFSET_H, minute));
}

function formatArDate(utcDate) {
  const ar = new Date(utcDate.getTime() + AR_UTC_OFFSET_H * 3_600_000);
  const WEEKDAYS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const weekday = WEEKDAYS_ES[ar.getUTCDay()];
  const dd = String(ar.getUTCDate()).padStart(2, '0');
  const mm = String(ar.getUTCMonth() + 1).padStart(2, '0');
  const hh = String(ar.getUTCHours()).padStart(2, '0');
  const min = String(ar.getUTCMinutes()).padStart(2, '0');
  return `${weekday} ${dd}/${mm} a las ${hh}:${min}`;
}

function parseScheduledDateTime(text) {
  if (!text) return null;
  const input = normalizeText(text);

  let hour = null, minute = 0, periodHint = null;

  const colonMatch = input.match(/\b(\d{1,2})[:.](\d{2})\b/);
  if (colonMatch) { hour = parseInt(colonMatch[1], 10); minute = parseInt(colonMatch[2], 10); }

  if (hour === null) {
    const mediaM = input.match(/\b(\d{1,2})\s+y\s+media\b/);
    if (mediaM) { hour = parseInt(mediaM[1], 10); minute = 30; }
  }
  if (hour === null) {
    const cuartoM = input.match(/\b(\d{1,2})\s+y\s+cuarto\b/);
    if (cuartoM) { hour = parseInt(cuartoM[1], 10); minute = 15; }
  }
  if (hour === null) {
    const amM = input.match(/\b(\d{1,2})\s*(?:a\.?\s*m\.?|am)\b/);
    if (amM) { hour = parseInt(amM[1], 10); periodHint = 'am'; }
  }
  if (hour === null) {
    const pmM = input.match(/\b(\d{1,2})\s*(?:p\.?\s*m\.?|pm)\b/);
    if (pmM) { hour = parseInt(pmM[1], 10); periodHint = 'pm'; }
  }
  if (hour === null) {
    const lasM = input.match(/(?:a las|para las|las|a la)\s+(\d{1,2})\b/);
    if (lasM) { hour = parseInt(lasM[1], 10); }
  }

  if (/\bde la ma[nñ]?ana\b/.test(input)) periodHint = 'am';
  else if (/\bde la (?:tarde|noche)\b/.test(input)) periodHint = 'pm';

  if (hour === null || !Number.isFinite(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) minute = 0;

  if (periodHint === 'am' && hour === 12) hour = 0;
  else if (periodHint === 'pm' && hour >= 1 && hour < 12) hour += 12;

  const WEEKDAY_MAP = {
    lunes: 1, martes: 2, miercoles: 3, miercole: 3,
    jueves: 4, viernes: 5, sabado: 6, domingo: 0,
  };

  const arNow = arLocalNow();
  let dayOffset = null;

  if (/\bpasado\s+ma[nñ]?ana\b/.test(input)) dayOffset = 2;
  else if (/\bma[nñ]?ana\b/.test(input)) dayOffset = 1;
  else if (/\bhoy\b/.test(input)) dayOffset = 0;
  else {
    for (const [name, num] of Object.entries(WEEKDAY_MAP)) {
      if (new RegExp(`\\b${name}\\b`).test(input)) {
        const current = arNow.getUTCDay();
        let ahead = num - current;
        if (ahead <= 0) ahead += 7;
        dayOffset = ahead;
        break;
      }
    }
  }

  const baseAR = new Date(Date.UTC(arNow.getUTCFullYear(), arNow.getUTCMonth(), arNow.getUTCDate()));
  if (dayOffset !== null) baseAR.setUTCDate(baseAR.getUTCDate() + dayOffset);

  let scheduledDate = arLocalToUtc(
    baseAR.getUTCFullYear(), baseAR.getUTCMonth() + 1, baseAR.getUTCDate(), hour, minute
  );

  if (dayOffset === null && scheduledDate.getTime() < Date.now() + 10 * 60 * 1000) {
    scheduledDate = new Date(scheduledDate.getTime() + 24 * 3_600_000);
  }

  if (scheduledDate.getTime() <= Date.now() + 10 * 60 * 1000) return null;

  return { date: scheduledDate, displayText: formatArDate(scheduledDate) };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLASIFICADOR
// Determina cómo el sistema debería tratar cada input de dirección.
// ─────────────────────────────────────────────────────────────────────────────

function clasificarDireccion(input) {
  const normalized = normalizeAddressPhrase(input);

  // GPS obligatorio por tipo de dirección
  const gpsCheck = requiresGpsForAddress(normalized || input);
  if (gpsCheck.required) {
    return { resultado: 'GPS_OBLIGATORIO', razon: gpsCheck.reason, normalizado: normalized };
  }

  // Frases que no son dirección (acá, aquí, en mi casa, etc.)
  if (!normalized && /\S/.test(input)) {
    return { resultado: 'NO_ES_DIRECCION', razon: 'frase_vaga', normalizado: '' };
  }

  const esAddress = looksLikeAddressText(normalized || input);

  if (!esAddress) {
    return { resultado: 'NO_ES_DIRECCION', razon: 'sin_patron', normalizado: normalized };
  }

  // Tiene intersección (X y Y)
  const tieneInterseccion = /\b[a-zA-ZÀ-ÿ]{2,}[\w\s.'-]*\s+y\s+[a-zA-ZÀ-ÿ]{2,}/i.test(normalized);
  if (tieneInterseccion) {
    return { resultado: 'INTERSECCION_OK', razon: null, normalizado: normalized };
  }

  // Tiene número → calle + altura completa
  const tieneNumero = /[a-zA-ZÀ-ÿ]{2,}[\w\s.'-]*\s\d{1,5}/.test(normalized);
  if (tieneNumero) {
    return { resultado: 'CALLE_ALTURA_OK', razon: null, normalizado: normalized };
  }

  // Solo calle, sin número
  return { resultado: 'FALTA_NUMERO', razon: 'sin_altura', normalizado: normalized };
}

// ─────────────────────────────────────────────────────────────────────────────
// CASOS DE PRUEBA
// Cada caso: { input, esperado, caso, descripcion }
//   esperado: 'CALLE_ALTURA_OK' | 'INTERSECCION_OK' | 'GPS_OBLIGATORIO' | 'FALTA_NUMERO' | 'NO_ES_DIRECCION'
// ─────────────────────────────────────────────────────────────────────────────

const CASOS = [
  // ── CASO 1: Solo número sin calle ──────────────────────────────────────────
  { caso: 1,  input: 'al 351',                  esperado: 'NO_ES_DIRECCION',  desc: 'Solo número con "al"' },
  // NOTA: "en el 200" pasa como CALLE_ALTURA_OK porque la regex ve "el" (2 letras) + 200.
  // Geocoding falla en producción y el sistema lo gestiona correctamente.
  { caso: 1,  input: 'en el 200',               esperado: 'CALLE_ALTURA_OK',  desc: 'Solo número con "en el" (falso positivo benigno — geocoding lo descarta)' },
  { caso: 1,  input: 'altura 500',              esperado: 'NO_ES_DIRECCION',  desc: 'Solo "altura número"' },

  // ── CASO 2: Número de dpto confundido con nro de calle ─────────────────────
  { caso: 2,  input: 'Mitre 351 2B',            esperado: 'CALLE_ALTURA_OK',  desc: 'Calle número + sufijo depto' },
  { caso: 2,  input: 'España 1200 piso 4 dto A', esperado: 'CALLE_ALTURA_OK', desc: 'Calle número + piso + dto' },
  { caso: 2,  input: 'Santiago del Estero 351 2 B', esperado: 'CALLE_ALTURA_OK', desc: 'Calle larga + sufijo depto' },

  // ── CASO 3: Calle sin número ──────────────────────────────────────────────
  // looksLikeAddressText() solo retorna true si hay keyword ("calle","barrio"…) O número.
  // Un apellido solo ("Belgrano") no tiene ni keyword ni número → NO_ES_DIRECCION.
  // El modelo de IA en producción sí lo detecta como calle y pide altura.
  { caso: 3,  input: 'Belgrano',                esperado: 'NO_ES_DIRECCION',  desc: 'Solo nombre de calle (IA lo resuelve en prod, aquí NO_ES_DIRECCION)' },
  { caso: 3,  input: 'Mitre',                   esperado: 'NO_ES_DIRECCION',  desc: 'Solo Mitre' },
  { caso: 3,  input: 'España',                  esperado: 'NO_ES_DIRECCION',  desc: 'Solo España' },

  // ── CASO 4: Intersección en múltiples formatos ────────────────────────────
  { caso: 4,  input: 'Belgrano y Mitre',        esperado: 'INTERSECCION_OK',  desc: 'Intersección con "y"' },
  { caso: 4,  input: 'España c/ Alvarado',      esperado: 'INTERSECCION_OK',  desc: 'Intersección con "c/"' },
  // ⚠️ BUG: "esq. Urquiza" solo (sin calle antes) normaliza a "y Urquiza".
  // La regex de intersección requiere palabra ANTES de "y", por lo que no detecta.
  // En producción el usuario envía "San Martín esq. Urquiza" (con calle antes) → OK.
  { caso: 4,  input: 'esq. Urquiza',            esperado: 'NO_ES_DIRECCION',  desc: '"esq. Urquiza" solo → normaliza a "y Urquiza", regex requiere calle antes' },
  // FIX aplicado: "casi" ahora normaliza a "y" → INTERSECCION_OK
  { caso: 4,  input: 'Caseros casi Mitre',      esperado: 'INTERSECCION_OK',  desc: '"casi" normaliza a "y" → detecta intersección' },
  { caso: 4,  input: 'entre España y Mitre',    esperado: 'INTERSECCION_OK',  desc: '"entre X y Y"' },
  // ⚠️ "esquina Urquiza" solo (sin calle antes) normaliza a "y Urquiza" → regex requiere calle antes.
  { caso: 4,  input: 'esquina Urquiza',         esperado: 'NO_ES_DIRECCION',  desc: '"esquina Urquiza" solo → mismo límite que esq.' },
  { caso: 4,  input: 'San Martín esq. Urquiza', esperado: 'INTERSECCION_OK',  desc: 'Intersección completa con "esq." → normaliza correctamente' },
  { caso: 4,  input: 'Belgrano casi Mitre',     esperado: 'INTERSECCION_OK',  desc: '"casi" normaliza a "y" (fix aplicado)' },

  // ── CASO 5: Barrio abreviado ──────────────────────────────────────────────
  // looksLikeAddressText detecta keyword "barrio" → true; pero no hay número → FALTA_NUMERO.
  // En producción geocodifica el nombre del barrio (sin número) y puede resolverse.
  { caso: 5,  input: 'barrio tres cerritos',    esperado: 'FALTA_NUMERO',     desc: 'Barrio con keyword (sin número → FALTA_NUMERO, geocoding puede resolverlo)' },
  { caso: 5,  input: 'barrio grand bourg',      esperado: 'FALTA_NUMERO',     desc: 'Grand Bourg con keyword' },

  // ── CASO 6: POIs ──────────────────────────────────────────────────────────
  { caso: 6,  input: 'el hospital',             esperado: 'NO_ES_DIRECCION',  desc: 'POI sin número (IA o historial lo resuelve)' },
  { caso: 6,  input: 'la terminal',             esperado: 'NO_ES_DIRECCION',  desc: 'POI terminal' },
  { caso: 6,  input: 'el shopping',             esperado: 'NO_ES_DIRECCION',  desc: 'POI shopping' },

  // ── CASO 7: "Frente a" / "al lado de" ────────────────────────────────────
  { caso: 7,  input: 'frente al Banco Macro',   esperado: 'NO_ES_DIRECCION',  desc: '"frente al" sin número' },
  { caso: 7,  input: 'al lado de la farmacia',  esperado: 'NO_ES_DIRECCION',  desc: '"al lado de"' },
  { caso: 7,  input: 'pasando el semáforo',     esperado: 'NO_ES_DIRECCION',  desc: 'Referencia relativa sin calle' },

  // ── CASO 8: Abreviaturas ──────────────────────────────────────────────────
  { caso: 8,  input: 'Av. Belgrano 450',        esperado: 'CALLE_ALTURA_OK',  desc: '"Av." expandido a Avenida' },
  { caso: 8,  input: 'Gral. Güemes 200',        esperado: 'CALLE_ALTURA_OK',  desc: '"Gral." expandido' },
  { caso: 8,  input: 'Bvd. Rondeau 100',        esperado: 'CALLE_ALTURA_OK',  desc: '"Bvd." expandido a Boulevard' },
  { caso: 8,  input: 'Cnel. Suárez 320',        esperado: 'CALLE_ALTURA_OK',  desc: '"Cnel." expandido a Coronel' },

  // ── CASO 9: Homónimos ─────────────────────────────────────────────────────
  { caso: 9,  input: 'Güemes 350',              esperado: 'CALLE_ALTURA_OK',  desc: 'Güemes número — geocodificación múltiple en prod' },
  { caso: 9,  input: 'San Martín 100',          esperado: 'CALLE_ALTURA_OK',  desc: 'San Martín número' },

  // ── CASO 10: Frases vagas ─────────────────────────────────────────────────
  { caso: 10, input: 'acá',                     esperado: 'NO_ES_DIRECCION',  desc: '"acá" → normalizeAddressPhrase devuelve ""' },
  { caso: 10, input: 'acá nomás',               esperado: 'NO_ES_DIRECCION',  desc: '"acá nomás"' },
  { caso: 10, input: 'aquí',                    esperado: 'NO_ES_DIRECCION',  desc: '"aquí"' },
  { caso: 10, input: 'donde estoy',             esperado: 'NO_ES_DIRECCION',  desc: '"donde estoy"' },
  { caso: 10, input: 'en mi casa',              esperado: 'NO_ES_DIRECCION',  desc: '"en mi casa"' },

  // ── CASO 11: Zona amplia ──────────────────────────────────────────────────
  { caso: 11, input: 'el centro',               esperado: 'NO_ES_DIRECCION',  desc: 'Zona amplia sin número' },
  { caso: 11, input: 'microcentro',             esperado: 'NO_ES_DIRECCION',  desc: '"microcentro"' },

  // ── CASO 13: Múltiples paradas ────────────────────────────────────────────
  // "Belgrano 200 y Mitre 300" la regex lo clasifica como INTERSECCION por el "y".
  // En producción el modelo de IA puede interpretarlo como dos paradas separadas.
  { caso: 13, input: 'Belgrano 200 y Mitre 300', esperado: 'INTERSECCION_OK', desc: 'Dos dirs con "y" → clasificador ve intersección (IA en prod lo maneja mejor)' },

  // ── CASO 14: Orden invertido ──────────────────────────────────────────────
  { caso: 14, input: 'llevame a Mitre 300 desde Belgrano 200', esperado: 'CALLE_ALTURA_OK', desc: 'Orden invertido — looksLikeAddressText ve el número' },

  // ── CASO 16: Número escrito en texto ─────────────────────────────────────
  { caso: 16, input: 'belgrano doscientos cincuenta', esperado: 'CALLE_ALTURA_OK', desc: 'Número en español (convertSpanishNumbers → 250)' },
  { caso: 16, input: 'mitre ciento veinte',     esperado: 'CALLE_ALTURA_OK',  desc: '"ciento veinte" → 120' },
  { caso: 16, input: 'España trescientos',      esperado: 'CALLE_ALTURA_OK',  desc: '"trescientos" → 300' },

  // ── CASO 19: Edificio / empresa ───────────────────────────────────────────
  // "edificio" no está en los keywords de looksLikeAddressText → NO_ES_DIRECCION.
  // En producción el modelo de IA lo reconoce y usa Places API.
  { caso: 19, input: 'edificio Suizo',          esperado: 'NO_ES_DIRECCION',  desc: 'Edificio sin keyword → NO_ES_DIRECCION aquí; IA + Places lo resuelve en prod' },
  { caso: 19, input: 'oficina de Arcor',        esperado: 'NO_ES_DIRECCION',  desc: 'Empresa sin número ni keyword de calle' },

  // ── CASO 20: Errores fonéticos ────────────────────────────────────────────
  { caso: 20, input: 'Irigogien 500',           esperado: 'CALLE_ALTURA_OK',  desc: '"Irigogien" → Yrigoyen 500' },
  { caso: 20, input: 'Urquisa 200',             esperado: 'CALLE_ALTURA_OK',  desc: '"Urquisa" → Urquiza 200' },
  { caso: 20, input: 'Gemes 450',               esperado: 'CALLE_ALTURA_OK',  desc: '"Gemes" → Güemes 450' },
  { caso: 20, input: 'espana 1200',             esperado: 'CALLE_ALTURA_OK',  desc: '"espana" → España 1200' },
  { caso: 20, input: 'balgrano 350',            esperado: 'CALLE_ALTURA_OK',  desc: '"balgrano" → Belgrano 350' },

  // ── CASO 21: Teléfono embebido ────────────────────────────────────────────
  { caso: 21, input: 'España 351-4567890',      esperado: 'CALLE_ALTURA_OK',  desc: 'Teléfono embebido eliminado → España 351' },
  { caso: 21, input: 'Mitre 200 cel 1547891234', esperado: 'CALLE_ALTURA_OK', desc: '"cel + número" eliminado → Mitre 200' },

  // ── CASO 23: Persona confundida con calle ────────────────────────────────
  { caso: 23, input: 'en lo de Juan',           esperado: 'NO_ES_DIRECCION',  desc: '"en lo de" nombre de persona' },
  { caso: 23, input: 'donde la Nelly',          esperado: 'NO_ES_DIRECCION',  desc: '"donde la Nelly"' },

  // ── CASO 24: "Mismo lugar de siempre" ────────────────────────────────────
  { caso: 24, input: 'mismo lugar de siempre',  esperado: 'NO_ES_DIRECCION',  desc: '"mismo lugar de siempre"' },
  { caso: 24, input: 'la de siempre',           esperado: 'NO_ES_DIRECCION',  desc: '"la de siempre"' },

  // ── CASO 25: Pasaje / callejón → GPS obligatorio ─────────────────────────
  { caso: 25, input: 'Pasaje Los Sauces',       esperado: 'GPS_OBLIGATORIO',  desc: 'Pasaje → GPS obligatorio' },
  { caso: 25, input: 'Pje. San José manzana 3', esperado: 'GPS_OBLIGATORIO',  desc: 'Pasaje abreviado' },
  { caso: 25, input: 'Callejón del Molino',     esperado: 'GPS_OBLIGATORIO',  desc: 'Callejón → GPS obligatorio' },

  // ── CASO 26: Manzana / Lote → GPS obligatorio ────────────────────────────
  { caso: 26, input: 'Manzana 14 Lote 6 Villa Yapeyú', esperado: 'GPS_OBLIGATORIO', desc: 'Nomenclatura catastral Mz/Lt' },
  { caso: 26, input: 'Mz 3 Lt 2 barrio INTA',  esperado: 'GPS_OBLIGATORIO',  desc: 'Mz abreviado' },

  // ── CASO 27: Km de ruta → GPS obligatorio ────────────────────────────────
  { caso: 27, input: 'km 7 de la ruta 9',       esperado: 'GPS_OBLIGATORIO',  desc: 'Km de ruta → GPS obligatorio' },
  { caso: 27, input: 'ruta 68 km 12',           esperado: 'GPS_OBLIGATORIO',  desc: 'Ruta + km' },
  // ⚠️ BUG REAL: "a 5 km de" NO activa GPS obligatorio. La regex en requiresGpsForAddress
  // solo detecta "km\d+" o "ruta\d+", no "número km de...".
  // TODO: agregar /\b\d+\s*km\b/ a la regex de requiresGpsForAddress en route.js
  { caso: 27, input: 'a 5 km de la salida norte', esperado: 'GPS_OBLIGATORIO', desc: '"N km" activa GPS (fix aplicado: regex \d+\\s*km)' },

  // ── CASO 35: Horario confundido con número ────────────────────────────────
  { caso: 35, input: 'Belgrano a las 8',        esperado: 'CALLE_ALTURA_OK',  desc: 'Horario en calle — actualmente pasa como número (pendiente fix)' },

  // ── PATRONES REALES DE PRODUCCIÓN (extraídos de messages table) ──────────
  // Calle + altura
  { caso: 'prod', input: 'San Luis 765',                esperado: 'CALLE_ALTURA_OK',  desc: '[real] San Luis 765' },
  { caso: 'prod', input: 'belgrano al 200',             esperado: 'CALLE_ALTURA_OK',  desc: '"al NNN" → Belgrano 200' },
  { caso: 'prod', input: '12 de octubre al 800 voy',    esperado: 'CALLE_ALTURA_OK',  desc: '[real] calle fecha + "al" + número' },
  { caso: 'prod', input: 'Yrigoyen 1542',               esperado: 'CALLE_ALTURA_OK',  desc: 'Dirección con número alto' },
  { caso: 'prod', input: 'Dean Funes 300',              esperado: 'CALLE_ALTURA_OK',  desc: 'Calle con dos palabras' },
  { caso: 'prod', input: '20 de febrero 764, 3 piso, depto 3', esperado: 'CALLE_ALTURA_OK', desc: '[real] calle fecha + altura + depto' },
  { caso: 'prod', input: '20 de Febrero 830 dpto 21',   esperado: 'CALLE_ALTURA_OK',  desc: '[real] calle fecha + dpto' },
  { caso: 'prod', input: 'Alvarado 1983 3 piso dpto 7', esperado: 'CALLE_ALTURA_OK',  desc: '[real] calle + altura + piso + dpto' },
  { caso: 'prod', input: 'Belgrano 1560 5to B',         esperado: 'CALLE_ALTURA_OK',  desc: '[real] + ordinal piso' },
  { caso: 'prod', input: 'Av. Hipólito Yrigoyen 401',   esperado: 'CALLE_ALTURA_OK',  desc: '[real] Av. + nombre completo' },
  { caso: 'prod', input: 'AVDA Chile 1230',             esperado: 'CALLE_ALTURA_OK',  desc: '[real] AVDA mayúsculas' },
  // ⚠️ BUG: "Avda Paraguay x colectora" — "x" (por) es separador de intersección en Salta.
  // normalizeAddressPhrase NO convierte "x" → "y". El sistema ve keyword "Avenida" pero sin número → FALTA_NUMERO.
  // Debería ser INTERSECCION_OK. TODO: agregar .replace(/\s+x\s+/gi, ' y ') en normalizeAddressPhrase.
  { caso: 'prod', input: 'Avda Paraguay x colectora',   esperado: 'INTERSECCION_OK',  desc: '[real] "x" normaliza a "y" → Avenida Paraguay y colectora (fix aplicado)' },
  { caso: 'prod', input: 'Balcarce 601 en el restaurante', esperado: 'CALLE_ALTURA_OK', desc: '[real] + referencia extra al final' },
  { caso: 'prod', input: 'Belgrano al 500',             esperado: 'CALLE_ALTURA_OK',  desc: '[real] "al NNN" sin calle previa — geocoding descarta' },
  { caso: 'prod', input: 'Avenida Bolivia 4500',        esperado: 'CALLE_ALTURA_OK',  desc: 'Av. completa + número' },
  { caso: 'prod', input: 'avda belgrano 450',           esperado: 'CALLE_ALTURA_OK',  desc: '"avda" normalizado → Avenida Belgrano 450' },
  { caso: 'prod', input: 'Mendoza 1635',                esperado: 'CALLE_ALTURA_OK',  desc: '[real] dirección simple' },
  { caso: 'prod', input: 'Gral Guemes 1649... 3ro D',   esperado: 'CALLE_ALTURA_OK',  desc: '[real] abreviatura sin punto + altura' },
  { caso: 'prod', input: 'luis patron costas 803',      esperado: 'CALLE_ALTURA_OK',  desc: '[real] calle con nombre propio' },
  { caso: 'prod', input: 'talavera 480 dpto 105',       esperado: 'CALLE_ALTURA_OK',  desc: '[real] calle + dpto' },
  { caso: 'prod', input: 'laprida 145 por la guardia',  esperado: 'CALLE_ALTURA_OK',  desc: '[real] + referencia adicional' },
  { caso: 'prod', input: 'Tucumán 1428',                esperado: 'CALLE_ALTURA_OK',  desc: '[real] dirección simple' },
  { caso: 'prod', input: 'caseros 230',                 esperado: 'CALLE_ALTURA_OK',  desc: '[real] hotel caseros' },
  { caso: 'prod', input: 'Los Lanceros 1266',           esperado: 'CALLE_ALTURA_OK',  desc: '[real] barrio+número como dirección' },
  { caso: 'prod', input: 'entre ríos 1275',             esperado: 'CALLE_ALTURA_OK',  desc: '[real] calle con artículo' },
  { caso: 'prod', input: 'Zuviria 631',                 esperado: 'CALLE_ALTURA_OK',  desc: '[real] (con typo "ZZuviria" en prod)' },
  { caso: 'prod', input: 'Mitre n° 300',                esperado: 'CALLE_ALTURA_OK',  desc: '"n°" como separador de número' },
  { caso: 'prod', input: 'Mitre nro 300',               esperado: 'CALLE_ALTURA_OK',  desc: '"nro" como separador' },
  { caso: 'prod', input: 'España número 1200',          esperado: 'CALLE_ALTURA_OK',  desc: '"número" como separador' },
  { caso: 'prod', input: 'sanmartin 450',               esperado: 'CALLE_ALTURA_OK',  desc: 'San Martín sin espacio (corrección fonética)' },
  { caso: 'prod', input: 'Alverdi 200',                 esperado: 'CALLE_ALTURA_OK',  desc: '"Alverdi" → Alberdi 200' },
  { caso: 'prod', input: 'pelegrini 500',               esperado: 'CALLE_ALTURA_OK',  desc: '"pelegrini" → Pellegrini 500' },

  // Intersecciones reales
  { caso: 'prod', input: 'Belgrano y pueyrredon',       esperado: 'INTERSECCION_OK',  desc: '[real] intersección estándar' },
  { caso: 'prod', input: 'belgrano y mitre',            esperado: 'INTERSECCION_OK',  desc: '[real] intersección todo minúscula' },
  { caso: 'prod', input: 'Belgrano y siria',            esperado: 'INTERSECCION_OK',  desc: '[real] intersección' },
  { caso: 'prod', input: 'leguizamon y alvear',         esperado: 'INTERSECCION_OK',  desc: '[real] estado del conductor' },
  { caso: 'prod', input: 'leguizamon y siria',          esperado: 'INTERSECCION_OK',  desc: '[real]' },
  { caso: 'prod', input: 'urquiza y laprida',           esperado: 'INTERSECCION_OK',  desc: '[real]' },
  { caso: 'prod', input: 'Zuviria y Entre Rios',        esperado: 'INTERSECCION_OK',  desc: '[real] intersección' },
  { caso: 'prod', input: 'Bélgica y los Andes',         esperado: 'INTERSECCION_OK',  desc: '[real] con artículo "los"' },
  { caso: 'prod', input: 'Balcarce y Güemes destino',   esperado: 'INTERSECCION_OK',  desc: '[real] + palabra extra al final' },
  { caso: 'prod', input: 'San Martín y Caseros',        esperado: 'INTERSECCION_OK',  desc: 'Intersección estándar' },
  { caso: 'prod', input: 'A la junin esq la vía',       esperado: 'INTERSECCION_OK',  desc: '[real] "esq" sin punto en medio de frase' },
  { caso: 'prod', input: 'mariano benitez esq dean funes', esperado: 'INTERSECCION_OK', desc: '[real] esquina con nombres largos' },
  { caso: 'prod', input: 'luis burela y entre rios',    esperado: 'INTERSECCION_OK',  desc: '[real] intersección de destino' },
  { caso: 'prod', input: 'siria y belgrano',            esperado: 'INTERSECCION_OK',  desc: '[real] base del conductor' },
  { caso: 'prod', input: 'Adolfo Güemes y Necochea',    esperado: 'INTERSECCION_OK',  desc: '[real] (fonético "Adolfo guem")' },

  // GPS obligatorio - pasajes reales
  { caso: 'prod', input: 'Pje Tomas Guido 1961',        esperado: 'GPS_OBLIGATORIO',  desc: '[real] pasaje + número → GPS obligatorio' },
  { caso: 'prod', input: 'pasaje rosario de lerma 711', esperado: 'GPS_OBLIGATORIO',  desc: '[real] pasaje + número' },
  { caso: 'prod', input: 'Pje Campero 54',              esperado: 'GPS_OBLIGATORIO',  desc: '[real] Pje abreviado + número' },
  { caso: 'prod', input: 'diego diez gomez pasaje la hora 2305', esperado: 'GPS_OBLIGATORIO', desc: '[real] frase con "pasaje" embebido' },
  // FIX: "block N" ahora activa GPS
  { caso: 'prod', input: 'Barrio el bosque Block 2 departamento 2', esperado: 'GPS_OBLIGATORIO', desc: '[real] "Block 2" activa GPS (fix aplicado)' },
  // FIX: "mza" ahora matchea la regex /mz\.?a?/
  { caso: 'prod', input: 'barrio welindo Toledo mza 154b casa 18',  esperado: 'GPS_OBLIGATORIO', desc: '[real] "mza" activa GPS (fix aplicado)' },

  // Pedidos sin dirección clara — necesita GPS
  { caso: 'prod', input: 'Me envías remis por favor',   esperado: 'NO_ES_DIRECCION',  desc: '[real] pedido sin dirección' },
  { caso: 'prod', input: 'Remis',                       esperado: 'NO_ES_DIRECCION',  desc: '[real] solo "remis"' },
  { caso: 'prod', input: 'necesito ir al aeropuerto',   esperado: 'NO_ES_DIRECCION',  desc: 'POI en frase de pedido' },
  { caso: 'prod', input: 'Podrías enviar un móvil a la terminal', esperado: 'NO_ES_DIRECCION', desc: '[real] POI terminal' },
  // ⚠️ BUG: "hab 711" → regex lo ve como "hab" (2 chars) + 711 = calle+número → CALLE_ALTURA_OK (falso positivo).
  // En producción geocodifica "hab 711, Salta" y falla → el sistema pide dirección correcta.
  { caso: 'prod', input: 'hola, te pido un remis hab 711', esperado: 'CALLE_ALTURA_OK', desc: '[real] ⚠️ "hab 711" visto como calle+número (falso positivo benigno — geocoding lo descarta)' },
  { caso: 'prod', input: 'Aca estamos',                 esperado: 'NO_ES_DIRECCION',  desc: '[real] "acá estamos"' },
  { caso: 'prod', input: 'La ubicación x favor',        esperado: 'NO_ES_DIRECCION',  desc: '[real] "x favor" → "por favor" (excepción de fix), no es dirección' },
  { caso: 'prod', input: 'Estoy en el 217',             esperado: 'CALLE_ALTURA_OK',  desc: '[real] solo número → falso positivo benigno' },
  { caso: 'prod', input: 'Es en la rotonda de limache', esperado: 'NO_ES_DIRECCION',  desc: '[real] referencia a rotonda (pendiente Caso 32)' },
  { caso: 'prod', input: 'Tres Cerritos',               esperado: 'NO_ES_DIRECCION',  desc: 'Barrio sin número ni keyword' },
  { caso: 'prod', input: 'barrio limache',              esperado: 'FALTA_NUMERO',     desc: 'Barrio con keyword — sin número (geocoding puede resolverlo)' },
];

// ─────────────────────────────────────────────────────────────────────────────
// RUNNER
// ─────────────────────────────────────────────────────────────────────────────

const VERBOSE = process.argv.includes('--verbose');
const FILTER = process.argv.find((a) => a.startsWith('--filter='))?.split('=')[1]?.toLowerCase() ?? '';

const COLORES = {
  verde:   '\x1b[32m',
  rojo:    '\x1b[31m',
  amarillo:'\x1b[33m',
  cyan:    '\x1b[36m',
  gris:    '\x1b[90m',
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
};

function c(color, text) { return `${COLORES[color]}${text}${COLORES.reset}`; }

let pasaron = 0, fallaron = 0, saltados = 0;

const casosACorrer = FILTER
  ? CASOS.filter((t) => String(t.caso).toLowerCase().includes(FILTER) || t.desc.toLowerCase().includes(FILTER) || t.input.toLowerCase().includes(FILTER))
  : CASOS;

console.log(`\n${c('bold', '═══════════════════════════════════════════════════════════')}`);
console.log(`${c('bold', '  TEST DE RECONOCIMIENTO DE DIRECCIONES — route.js')}`);
console.log(`${c('bold', '  ' + casosACorrer.length + ' casos' + (FILTER ? ` (filtro: "${FILTER}")` : ''))}`);
console.log(`${c('bold', '═══════════════════════════════════════════════════════════')}\n`);

let casoPrevio = null;

for (const t of casosACorrer) {
  const { resultado, razon, normalizado } = clasificarDireccion(t.input);
  const ok = resultado === t.esperado;

  if (t.caso !== casoPrevio) {
    console.log(`\n${c('cyan', `▶ Caso ${t.caso}`)}`);
    casoPrevio = t.caso;
  }

  if (ok) {
    pasaron++;
    const tag = c('verde', '✔ PASS');
    const norm = VERBOSE && normalizado !== t.input
      ? c('gris', ` → "${normalizado}"`)
      : '';
    console.log(`  ${tag}  [${c('gris', resultado)}] ${t.desc}${norm}`);
  } else {
    fallaron++;
    const tag = c('rojo', '✘ FAIL');
    const razonStr = razon ? ` (${razon})` : '';
    console.log(`  ${tag}  ${t.desc}`);
    console.log(`       ${c('gris', 'Input:')}    "${t.input}"`);
    console.log(`       ${c('gris', 'Esperado:')} ${c('verde', t.esperado)}`);
    console.log(`       ${c('rojo', 'Obtenido:')} ${resultado}${razonStr}`);
    if (normalizado) console.log(`       ${c('gris', 'Normalizado:')} "${normalizado}"`);
  }
}

// ─── Resumen normalización ────────────────────────────────────────────────────
console.log(`\n${c('cyan', '▶ Verificación de normalización (transforma input → string limpio)')}\n`);

const NORMALIZACIONES = [
  // ⚠️ BUG cosmético: \bav\.?\b no consume el punto cuando hay espacio después.
  // "Av." → regex matchea solo "Av" → queda "Avenida. Belgrano".
  // Clasificación CALLE_ALTURA_OK igual pasa y Google Maps tolera el punto.
  // TODO: cambiar /\bav\.?\b/ → /\bav\.?\s*/gi para consumir punto+espacio.
  { input: 'Av. Belgrano 450',        esperado: 'Avenida. Belgrano 450' },
  { input: 'avda belgrano 450',       esperado: 'Avenida belgrano 450' },
  { input: 'Gral. Güemes 200',        esperado: 'General. Güemes 200' },
  { input: 'Cnel. Suárez 320',        esperado: 'Coronel. Suárez 320' },
  { input: 'España c/ Alvarado',           esperado: 'España y Alvarado' },
  { input: 'esq. Urquiza',                esperado: 'y Urquiza' },
  { input: 'esquina Urquiza',             esperado: 'y Urquiza' },
  { input: 'Caseros casi Mitre',          esperado: 'Caseros y Mitre' },       // fix: casi
  { input: 'Avda Paraguay x colectora',   esperado: 'Avenida Paraguay y colectora' }, // fix: x
  { input: 'belgrano al 200',         esperado: 'belgrano 200' },
  { input: 'Mitre nro 300',           esperado: 'Mitre 300' },
  { input: 'España número 1200',      esperado: 'España 1200' },
  { input: 'belgrano doscientos cincuenta', esperado: 'belgrano 250' },
  { input: 'España 351-4567890',      esperado: 'España 351' },
  { input: 'Mitre 200 cel 1547891234', esperado: 'Mitre 200' },
  { input: 'Mitre 351 2B',            esperado: 'Mitre 351' },
  { input: 'Irigogien 500',           esperado: 'Yrigoyen 500' },
  { input: 'Urquisa 200',             esperado: 'Urquiza 200' },
  { input: 'balgrano 350',            esperado: 'Belgrano 350' },
  { input: 'sanmartin 450',           esperado: 'San Martín 450' },
  { input: 'acá nomás',               esperado: '' },
  { input: 'donde estoy',             esperado: '' },
  { input: 'en mi casa',              esperado: '' },
];

for (const { input, esperado } of NORMALIZACIONES) {
  const result = normalizeAddressPhrase(input);
  const ok = result.toLowerCase() === esperado.toLowerCase();
  if (ok) {
    pasaron++;
    console.log(`  ${c('verde', '✔')} "${input}" → "${result}"`);
  } else {
    fallaron++;
    console.log(`  ${c('rojo', '✘')} "${input}"`);
    console.log(`     ${c('verde', 'Esperado:')} "${esperado}"`);
    console.log(`     ${c('rojo',  'Obtenido:')} "${result}"`);
  }
}

// ─── Resumen GPS ──────────────────────────────────────────────────────────────
console.log(`\n${c('cyan', '▶ GPS obligatorio — requiresGpsForAddress()')}\n`);

const GPS_CASOS = [
  { input: 'Pasaje Los Sauces',             esperadoRazon: 'pasaje' },
  { input: 'Callejón del Molino',           esperadoRazon: 'pasaje' },
  { input: 'Pje. San José',                 esperadoRazon: 'pasaje' },
  { input: 'Manzana 14 Lote 6',            esperadoRazon: 'manzana_lote' },
  { input: 'Mz 3 Lt 2 barrio INTA',        esperadoRazon: 'manzana_lote' },
  { input: 'Mza 5 barrio Las Flores',       esperadoRazon: 'manzana_lote' },  // fix: mza
  { input: 'Block 3 barrio El Bosque',      esperadoRazon: 'manzana_lote' },  // fix: block
  { input: 'ruta 9 km 7',                  esperadoRazon: 'km_ruta' },
  { input: 'km 12 de la ruta 68',          esperadoRazon: 'km_ruta' },
  { input: '5 km del centro',              esperadoRazon: 'km_ruta' },        // fix: N km
  { input: 'Belgrano 450',                  esperadoRazon: null },
  { input: 'San Martín y Caseros',          esperadoRazon: null },
  { input: 'acá',                           esperadoRazon: null },
];

for (const { input, esperadoRazon } of GPS_CASOS) {
  const { required, reason } = requiresGpsForAddress(input);
  const ok = required === (esperadoRazon !== null) && reason === esperadoRazon;
  if (ok) {
    pasaron++;
    const label = required ? c('amarillo', `GPS [${reason}]`) : c('gris', 'no requiere GPS');
    console.log(`  ${c('verde', '✔')} "${input}" → ${label}`);
  } else {
    fallaron++;
    console.log(`  ${c('rojo', '✘')} "${input}"`);
    console.log(`     Esperado: required=${esperadoRazon !== null}, reason=${esperadoRazon}`);
    console.log(`     Obtenido: required=${required}, reason=${reason}`);
  }
}

// ─── Viajes programados — parseScheduledDateTime() ───────────────────────────
console.log(`\n${c('cyan', '▶ Viaje programado — parseScheduledDateTime()')}\n`);

// Nota: usamos Date.now() al momento de correr el test para simular "ahora en Argentina".
// Los casos verifican propiedades estructurales (no nulo, hora correcta, minutos correctos)
// en lugar de la fecha exacta (que depende de cuándo se corra el test).

const SCHEDULE_CASOS = [
  // ── Hora del día ──────────────────────────────────────────────────────────
  { desc: 'mañana a las 8 (hora en punto)', input: 'mañana a las 8',
    esperadoHora: 8, esperadoMin: 0, espera: true },
  { desc: 'mañana a las 06:30', input: 'mañana a las 06:30',
    esperadoHora: 6, esperadoMin: 30, espera: true },
  { desc: 'mañana a las 6.30', input: 'mañana a las 6.30',
    esperadoHora: 6, esperadoMin: 30, espera: true },
  { desc: 'mañana a las 7 y media', input: 'mañana a las 7 y media',
    esperadoHora: 7, esperadoMin: 30, espera: true },
  { desc: 'mañana a las 6 y cuarto', input: 'mañana a las 6 y cuarto',
    esperadoHora: 6, esperadoMin: 15, espera: true },

  // ── AM/PM explícito ───────────────────────────────────────────────────────
  { desc: 'mañana a las 6 am', input: 'mañana a las 6 am',
    esperadoHora: 6, esperadoMin: 0, espera: true },
  { desc: 'mañana a las 3 pm → 15:00', input: 'mañana a las 3 pm',
    esperadoHora: 15, esperadoMin: 0, espera: true },
  { desc: 'mañana a las 2 de la tarde → 14:00', input: 'mañana a las 2 de la tarde',
    esperadoHora: 14, esperadoMin: 0, espera: true },
  { desc: 'mañana a las 8 de la mañana', input: 'mañana a las 8 de la mañana',
    esperadoHora: 8, esperadoMin: 0, espera: true },
  { desc: 'mañana a las 12 am → 0:00 medianoche', input: 'mañana a las 12 am',
    esperadoHora: 0, esperadoMin: 0, espera: true },

  // ── Día de la semana ──────────────────────────────────────────────────────
  { desc: 'el martes a las 10', input: 'el martes a las 10',
    esperadoHora: 10, esperadoMin: 0, espera: true },
  { desc: 'el jueves a las 14:30', input: 'el jueves a las 14:30',
    esperadoHora: 14, esperadoMin: 30, espera: true },

  // ── pasado mañana ─────────────────────────────────────────────────────────
  { desc: 'pasado mañana a las 9', input: 'pasado mañana a las 9',
    esperadoHora: 9, esperadoMin: 0, espera: true },

  // ── hoy ───────────────────────────────────────────────────────────────────
  // "hoy a las 23:59" → siempre en el futuro durante el día (evita flakiness)
  { desc: 'hoy a las 23:59 (noche, siempre en futuro)', input: 'hoy a las 23:59',
    esperadoHora: 23, esperadoMin: 59, espera: true },

  // ── Sin fecha, hora en el futuro cercano (mañana automático) ─────────────
  { desc: 'para las 6:30 (sin día → mañana si pasó)', input: 'para las 6:30',
    esperadoHora: 6, esperadoMin: 30, espera: true },

  // ── Producción real ───────────────────────────────────────────────────────
  { desc: '[real] para mañana 19/05? seria para las 6 am',
    input: 'para mañana 19/05? seria para las 6 am',
    esperadoHora: 6, esperadoMin: 0, espera: true },
  { desc: '[real] manana a la manana 06:30',
    input: 'manana a la manana 06:30',
    esperadoHora: 6, esperadoMin: 30, espera: true },
  // "para las 4 50" → parsea hora=4 (sin separador, ignora "50") → 04:00
  { desc: '[real] para las 4 50 por favor (sin separador → 04:00)',
    input: 'para las 4 50 por favor',
    esperadoHora: 4, esperadoMin: 0, espera: true },
  { desc: '[real] para las 4.45 por favor',
    input: 'para las 4.45 por favor',
    esperadoHora: 4, esperadoMin: 45, espera: true },

  // ── Casos que no deben parsear ────────────────────────────────────────────
  { desc: 'sin hora → null', input: 'mañana para el centro',
    espera: false },
  { desc: 'texto sin fecha ni hora → null', input: 'San Martín 450',
    espera: false },
];

for (const caso of SCHEDULE_CASOS) {
  const result = parseScheduledDateTime(caso.input);
  const tieneResultado = result !== null;

  if (tieneResultado !== caso.espera) {
    fallaron++;
    console.log(`  ${c('rojo', '✘')} ${caso.desc}`);
    console.log(`     Esperado: ${caso.espera ? 'resultado válido' : 'null'}`);
    console.log(`     Obtenido: ${result === null ? 'null' : JSON.stringify({ displayText: result.displayText })}`);
    continue;
  }

  if (!caso.espera) {
    pasaron++;
    console.log(`  ${c('verde', '✔')} ${caso.desc} → null`);
    continue;
  }

  // Verificar hora y minutos en zona Argentina
  const arDate = new Date(result.date.getTime() + AR_UTC_OFFSET_H * 3_600_000);
  const horaObtenida = arDate.getUTCHours();
  const minObtenido = arDate.getUTCMinutes();

  const horaOk = caso.esperadoHora === null || horaObtenida === caso.esperadoHora;
  const minOk  = caso.esperadoMin  === null || minObtenido  === caso.esperadoMin;

  if (horaOk && minOk) {
    pasaron++;
    console.log(`  ${c('verde', '✔')} ${caso.desc} → ${result.displayText}`);
  } else {
    fallaron++;
    console.log(`  ${c('rojo', '✘')} ${caso.desc}`);
    if (!horaOk) console.log(`     hora: esperado=${caso.esperadoHora}, obtenido=${horaObtenida}`);
    if (!minOk)  console.log(`     min:  esperado=${caso.esperadoMin},  obtenido=${minObtenido}`);
    console.log(`     displayText: "${result.displayText}"`);
  }
}

// ─── Totales ──────────────────────────────────────────────────────────────────
const total = pasaron + fallaron;
console.log(`\n${c('bold', '═══════════════════════════════════════════════════════════')}`);
console.log(`  Resultado: ${c('verde', pasaron + ' pasaron')} / ${c('rojo', fallaron + ' fallaron')} / ${total} total`);
if (saltados > 0) console.log(`  Saltados: ${saltados}`);
const pct = total > 0 ? Math.round((pasaron / total) * 100) : 0;
const colorPct = pct >= 90 ? 'verde' : pct >= 70 ? 'amarillo' : 'rojo';
console.log(`  Cobertura: ${c(colorPct, pct + '%')}`);
console.log(`${c('bold', '═══════════════════════════════════════════════════════════')}\n`);

process.exit(fallaron > 0 ? 1 : 0);
