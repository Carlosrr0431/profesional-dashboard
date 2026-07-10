// Pin de ubicación — borde sólido (sin sombra) para que no se vea borroso
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
    return { fill: '#7C3AED', text: '#5B21B6', opacity: 1 };
  }
  if (driver.activeTrip) {
    return { fill: '#EF4444', text: '#B91C1C', opacity: 1 };
  }
  if (driver.isOnline) {
    return {
      fill: '#16A34A',
      text: '#15803D',
      opacity: 1,
    };
  }
  return {
    fill: '#64748B',
    text: '#334155',
    opacity: 1,
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
  const scale = isSelected || isMultiSelected ? 1.1 : 1;
  const width = Math.round(38 * scale);
  const height = Math.round(46 * scale);

  let badgeText = '';
  if (isMultiSelected) {
    badgeText = '✓';
  } else if (driver.driverNumber != null && String(driver.driverNumber).trim() !== '') {
    badgeText = String(driver.driverNumber);
  } else if (driver.isAssignedDriver) {
    badgeText = 'A';
  }

  const fontSize = badgeFontSize(badgeText);
  // Borde del mismo color sólido que el relleno (sin sombra ni halo)
  const stroke = style.fill;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 48 58" shape-rendering="geometricPrecision">
    <path d="${PIN_BODY}" fill="${style.fill}" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round" opacity="${style.opacity}"/>
    <circle cx="24" cy="20" r="11" fill="#ffffff"/>
    ${badgeText
      ? `<text x="24" y="25" text-anchor="middle" font-family="Inter,system-ui,-apple-system,sans-serif" font-size="${fontSize}" font-weight="800" fill="${style.text}">${escapeXml(badgeText)}</text>`
      : `<circle cx="24" cy="20" r="4" fill="${style.fill}"/>`}
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

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44" shape-rendering="geometricPrecision">
    <circle cx="22" cy="22" r="13" fill="#ffffff" stroke="${accent}" stroke-width="3"/>
    <circle cx="22" cy="22" r="5.5" fill="${accent}"/>
    ${label !== '·' ? `<rect x="24" y="6" width="16" height="12" rx="6" fill="#0F172A"/>
    <text x="32" y="14.5" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="8" font-weight="700" fill="#ffffff">${escapeXml(label)}</text>` : ''}
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
