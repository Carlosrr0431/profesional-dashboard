/**
 * Detección robusta de intención de cancelar por WhatsApp (mayúsculas, tildes, typos).
 */

export function normalizePassengerMessage(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  const s = String(a || '');
  const t = String(b || '');
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;

  const rows = s.length + 1;
  const cols = t.length + 1;
  const matrix = Array.from({ length: rows }, () => new Array(cols).fill(0));

  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[rows - 1][cols - 1];
}

/** Token suelto tipo cancelar / cancelá / cancellar / canselar */
export function isCancelarLikeToken(token) {
  const t = normalizePassengerMessage(token).replace(/\s+/g, '');
  if (!t || t.length < 5 || t.length > 14) return false;

  if (/^cancel/.test(t)) return true;
  if (/^cancell?ar$/.test(t)) return true;
  if (/^cance+l?ar$/.test(t)) return true;
  if (/^cansel+ar$/.test(t)) return true;
  if (/^canser+ar$/.test(t)) return true;
  if (/^anul/.test(t) && t.length <= 10) return true;

  if (t.length >= 6 && t.length <= 11) {
    const dist = levenshtein(t, 'cancelar');
    if (dist <= 2) return true;
  }
  return false;
}

const CANCEL_PHRASE_PATTERNS = [
  /\b(ya no|no) (lo )?(quiero|necesito|mandes|va)\b/,
  /\bno quiero (el |la |mi |mas |)(remis|viaje|pedido|reserva|m[oó]vil)\b/,
  /\bno necesito (el |la |mi |)(remis|viaje|pedido|reserva|m[oó]vil)\b/,
  /\b(olvidalo|olvida|me surgio)\b/,
  /\bpara el remis\b/,
  /\b(quiero|necesito|podes|podrias|favor de?|por favor) (cancelar|cancelarlo|cancelarla|anular)\b/,
  /\b(cancelar|cancelalo|cancelala|cancelame|anular) (el |la |mi )?(viaje|pedido|reserva|remis|m[oó]vil)\b/,
  /\b(dale )?cancel(ar|a|alo|ala|ame|emos)\b/,
  /\banular (el |la |mi )?(viaje|pedido|reserva)\b/,
  /\b(sacame|sacar) (el |la |mi )?(viaje|pedido|reserva)\b/,
];

const AFFIRMATIVE_CANCEL_PATTERNS = [
  /^s+i*$/,
  /^yes$/,
  /^ok$/,
  /^dale$/,
  /^listo$/,
  /^confirmo$/,
  /^confirmar$/,
  /^de acuerdo$/,
  /^esta bien$/,
  /\bs+i+\b/,
  /\byes\b/,
  /\bconfirmo\b/,
  /\bconfirmar\b/,
  /\bde acuerdo\b/,
  /\besta bien\b/,
  /\b(dale|ok|listo)\b/,
];

function stripCancelFiller(norm) {
  return norm
    .replace(
      /\b(por favor|please|pls|el|la|lo|los|las|mi|mis|tu|viaje|pedido|reserva|remis|movil|quiero|necesito|favor|dale|por)\b/g,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();
}

/** Mensaje que es básicamente solo "cancelar" (con ruido mínimo). */
export function isStandaloneCancelMessage(text) {
  const norm = normalizePassengerMessage(text);
  if (!norm) return false;

  const stripped = stripCancelFiller(norm);
  if (!stripped) return false;

  const tokens = stripped.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  return tokens.every(isCancelarLikeToken);
}

function looksLikePriceQuestionOnly(norm) {
  return (
    /\b(cuanto|precio|sale|cuesta|valor|tarifa)\b/.test(norm)
    && !/\b(quiero|necesito|dale|cancel)\b/.test(norm)
  );
}

/** Primera señal: el pasajero quiere iniciar cancelación. */
export function messageRequestsTripCancel(text) {
  const norm = normalizePassengerMessage(text);
  if (!norm) return false;
  if (messageDeniesTripCancel(text)) return false;
  if (looksLikePriceQuestionOnly(norm)) return false;

  if (isStandaloneCancelMessage(text)) return true;

  for (const pattern of CANCEL_PHRASE_PATTERNS) {
    if (pattern.test(norm)) return true;
  }

  const words = norm.split(/\s+/).filter(Boolean);
  if (words.length <= 10 && words.some(isCancelarLikeToken)) {
    return true;
  }

  return false;
}

/** Respuesta cuando ya pedimos confirmación (sí / cancelar otra vez). */
export function messageConfirmsTripCancel(text) {
  const norm = normalizePassengerMessage(text);
  if (!norm) return false;
  if (messageDeniesTripCancel(text)) return false;

  for (const pattern of AFFIRMATIVE_CANCEL_PATTERNS) {
    if (pattern.test(norm)) return true;
  }

  if (isStandaloneCancelMessage(text)) return true;
  if (messageRequestsTripCancel(text)) return true;

  return false;
}

/** Respuesta negativa a la confirmación de cancelación. */
export function messageDeniesTripCancel(text) {
  const norm = normalizePassengerMessage(text);
  if (!norm) return false;

  if (/\bno\s+(quiero\s+)?cancel/.test(norm)) return true;
  if (/\bno\s+cancel/.test(norm)) return true;
  if (/\b(cancelar\s+no|no\s+anular)\b/.test(norm)) return true;
  if (/\b(mantener|mantenelo|mantengan|conserva|conservalo|dejalo como esta|dejalo asi|seguir|sigue igual)\b/.test(norm)) {
    return true;
  }
  if (/\b(nop|nah)\b/.test(norm)) return true;
  if (/^no$/.test(norm) || /\bno\s*$/i.test(String(text || '').trim())) return true;

  return false;
}

export function isCancelConfirmationPollYesVote(votedName) {
  const norm = normalizePassengerMessage(votedName);
  if (!norm) return false;
  if (/\bno\b/.test(norm) && /\bmantener\b/.test(norm)) return false;
  return norm.includes('cancelar') && (norm.includes('si') || norm.startsWith('cancelar'));
}

export function isCancelConfirmationPollNoVote(votedName) {
  const norm = normalizePassengerMessage(votedName);
  if (!norm) return false;
  return norm.includes('mantener') || (norm.startsWith('no') && !norm.includes('cancelar'));
}
