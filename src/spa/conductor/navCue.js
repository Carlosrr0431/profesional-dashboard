function metersBetween(lat1, lng1, lat2, lng2) {
  const dLat = (lat2 - lat1) * 111320;
  const dLng = (lng2 - lng1) * 111320 * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
  return Math.hypot(dLat, dLng);
}

export function maneuverPhrase(step) {
  const raw = String(step?.maneuver || 'straight').toLowerCase();
  const street = String(step?.html_instructions || '').trim();
  let action = 'Seguí derecho';
  if (raw.startsWith('arrive')) action = 'Llegaste';
  else if (raw.startsWith('depart')) action = 'Salí';
  else if (raw.includes('uturn')) action = 'Dá la vuelta';
  else if (raw.includes('roundabout')) action = 'Entrá a la rotonda';
  else if (raw.includes('sharp-left') || raw === 'turn-left' || raw.endsWith('-left')) action = 'Doblá a la izquierda';
  else if (raw.includes('sharp-right') || raw === 'turn-right' || raw.endsWith('-right')) action = 'Doblá a la derecha';
  else if (raw.includes('slight-left')) action = 'Mantenete a la izquierda';
  else if (raw.includes('slight-right')) action = 'Mantenete a la derecha';
  if (!street || action === 'Llegaste') return action;
  return `${action} en ${street}`;
}

export function formatCueDistance(meters) {
  const value = Math.max(0, Math.round(Number(meters) || 0));
  if (value >= 1000) return `${(value / 1000).toFixed(1)} km`;
  return `${value} m`;
}

/** El próximo giro que todavía no pasó el GPS. */
export function currentNavCue(steps, lat, lng, passedMeters = 28) {
  if (!Array.isArray(steps) || !steps.length) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const end = step?.endLocation;
    if (!Number.isFinite(end?.lat) || !Number.isFinite(end?.lng)) continue;
    const distance = metersBetween(lat, lng, end.lat, end.lng);
    if (distance > passedMeters) {
      return {
        phrase: maneuverPhrase(step),
        distanceLabel: formatCueDistance(distance),
        index,
      };
    }
  }
  const last = steps[steps.length - 1];
  return { phrase: maneuverPhrase(last), distanceLabel: 'ahora', index: steps.length - 1 };
}
