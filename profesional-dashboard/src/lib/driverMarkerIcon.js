// Pin de ubicación minimalista — punta exacta en la coordenada del chofer
const PIN_BODY =
  'M16 1C10.75 1 6.5 5.25 6.5 10.5C6.5 17.25 16 33 16 33C16 33 25.5 17.25 25.5 10.5C25.5 5.25 21.25 1 16 1Z';

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getMarkerStyle(isMultiSelected, driver) {
  if (isMultiSelected) {
    return { fill: '#7C3AED', ring: '#5B21B6', text: '#ffffff', opacity: 1 };
  }
  if (driver.activeTrip) {
    return { fill: '#EF4444', ring: '#B91C1C', text: '#ffffff', opacity: 1 };
  }
  if (driver.isOnline) {
    return { fill: '#22C55E', ring: '#15803D', text: '#ffffff', opacity: 1 };
  }
  return { fill: '#94A3B8', ring: '#64748B', text: '#ffffff', opacity: 0.72 };
}

export function buildDriverMarkerIconSpec(driver, isSelected, isMultiSelected) {
  const style = getMarkerStyle(isMultiSelected, driver);
  const scale = isSelected || isMultiSelected ? 1.14 : 1;
  const width = Math.round(28 * scale);
  const height = Math.round(36 * scale);
  const badgeText = isMultiSelected
    ? '✓'
    : (driver.driverNumber != null ? String(driver.driverNumber) : '');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 32 36">
    <defs>
      <filter id="sh" x="-30%" y="-20%" width="160%" height="160%">
        <feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="#0f172a" flood-opacity="0.28"/>
      </filter>
    </defs>
    <g opacity="${style.opacity}" filter="url(#sh)">
      <path d="${PIN_BODY}" fill="${style.fill}" stroke="${style.ring}" stroke-width="1.4" stroke-linejoin="round"/>
      <circle cx="16" cy="10.5" r="5.2" fill="#ffffff" fill-opacity="0.96"/>
      ${badgeText
        ? `<text x="16" y="13.5" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="${badgeText.length > 1 ? 7.5 : 9}" font-weight="800" fill="${style.fill}">${escapeXml(badgeText)}</text>`
        : `<circle cx="16" cy="10.5" r="2.2" fill="${style.fill}"/>`}
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

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
    <circle cx="22" cy="22" r="18" fill="${accentSoft}"/>
    <circle cx="22" cy="22" r="13.5" fill="#ffffff" stroke="${accentRing}" stroke-width="2"/>
    <circle cx="22" cy="22" r="5.5" fill="${accent}"/>
    ${label !== '·' ? `<rect x="24" y="8" width="16" height="12" rx="6" fill="#0F172A" opacity="0.88"/>
    <text x="32" y="16.5" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="7.5" font-weight="700" fill="#ffffff">${escapeXml(label)}</text>` : ''}
  </svg>`;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    width: 44,
    height: 44,
    anchorX: 22,
    anchorY: 22,
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
