// Pin de ubicación — cabeza grande para leer el número de móvil
const PIN_BODY =
  'M24 2C14.06 2 6 10.06 6 20C6 32.5 24 58 24 58C24 58 42 32.5 42 20C42 10.06 33.94 2 24 2Z';

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getMarkerStyle(isMultiSelected, driver) {
  if (isMultiSelected) {
    return { fill: '#7C3AED', ring: '#5B21B6', text: '#5B21B6', opacity: 1 };
  }
  if (driver.activeTrip) {
    return { fill: '#EF4444', ring: '#B91C1C', text: '#B91C1C', opacity: 1 };
  }
  if (driver.isOnline) {
    return {
      fill: '#22C55E',
      ring: driver.isAssignedDriver ? '#4F46E5' : '#15803D',
      text: driver.isAssignedDriver ? '#4F46E5' : '#15803D',
      opacity: 1,
    };
  }
  return {
    fill: '#94A3B8',
    ring: driver.isAssignedDriver ? '#6366F1' : '#64748B',
    text: driver.isAssignedDriver ? '#4F46E5' : '#475569',
    opacity: 0.85,
  };
}

function badgeFontSize(text) {
  const len = String(text).length;
  if (len <= 1) return 16;
  if (len === 2) return 14;
  if (len === 3) return 11;
  return 9;
}

export function buildDriverMarkerIconSpec(driver, isSelected, isMultiSelected) {
  const style = getMarkerStyle(isMultiSelected, driver);
  const scale = isSelected || isMultiSelected ? 1.12 : 1;
  const width = Math.round(48 * scale);
  const height = Math.round(58 * scale);

  // Priorizar número de móvil; "A" solo si no hay número
  let badgeText = '';
  if (isMultiSelected) {
    badgeText = '✓';
  } else if (driver.driverNumber != null && String(driver.driverNumber).trim() !== '') {
    badgeText = String(driver.driverNumber);
  } else if (driver.isAssignedDriver) {
    badgeText = 'A';
  }

  const fontSize = badgeFontSize(badgeText);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 48 58">
    <defs>
      <filter id="sh" x="-25%" y="-15%" width="150%" height="150%">
        <feDropShadow dx="0" dy="2" stdDeviation="1.6" flood-color="#0f172a" flood-opacity="0.32"/>
      </filter>
    </defs>
    <g opacity="${style.opacity}" filter="url(#sh)">
      <path d="${PIN_BODY}" fill="${style.fill}" stroke="${style.ring}" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="24" cy="20" r="11.5" fill="#ffffff" fill-opacity="0.98"/>
      ${badgeText
        ? `<text x="24" y="25.2" text-anchor="middle" font-family="Inter,system-ui,-apple-system,sans-serif" font-size="${fontSize}" font-weight="800" fill="${style.text}">${escapeXml(badgeText)}</text>`
        : `<circle cx="24" cy="20" r="4" fill="${style.fill}"/>`}
    </g>
  </svg>`;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    width,
    height,
    anchorX: width / 2,
    anchorY: height - 1,
  };
}

export function buildPassengerMarkerIconSpec(createdAt, status = 'queued') {
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const mins = Math.floor(diffMs / 60000);
  const label = mins < 1 ? '·' : mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h`;

  const isPending = status === 'pending';
  const accent = isPending ? '#DC2626' : '#F59E0B';
  const accentSoft = isPending ? 'rgba(220,38,38,0.16)' : 'rgba(245,158,11,0.18)';
  const accentRing = isPending ? 'rgba(220,38,38,0.28)' : 'rgba(245,158,11,0.34)';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
    <circle cx="24" cy="24" r="20" fill="${accentSoft}"/>
    <circle cx="24" cy="24" r="14.5" fill="#ffffff" stroke="${accentRing}" stroke-width="2.2"/>
    <circle cx="24" cy="24" r="6" fill="${accent}"/>
    ${label !== '·' ? `<rect x="26" y="8" width="18" height="13" rx="6.5" fill="#0F172A" opacity="0.9"/>
    <text x="35" y="17.5" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="8.5" font-weight="700" fill="#ffffff">${escapeXml(label)}</text>` : ''}
  </svg>`;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    width: 48,
    height: 48,
    anchorX: 24,
    anchorY: 24,
  };
}

export function toGoogleMarkerIcon(spec) {
  if (!spec || !window.google?.maps) return undefined;
  return {
    url: spec.url,
    scaledSize: new window.google.maps.Size(spec.width, spec.height),
    anchor: new window.google.maps.Point(spec.anchorX, spec.anchorY),
  };
}
