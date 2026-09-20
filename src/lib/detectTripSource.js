export const EMPTY_SOURCE_COUNTS = {
  passenger_web: 0,
  passenger_app: 0,
  whatsapp: 0,
  dashboard: 0,
  street_hail: 0,
  otro: 0,
};

export function emptySourceCounts() {
  return { ...EMPTY_SOURCE_COUNTS };
}

export function isPassengerChannelSource(source) {
  return source === 'passenger_app' || source === 'passenger_web';
}

export function detectTripSource(notes) {
  const text = String(notes || '').toLowerCase();
  if (text.includes('[passenger_web]')) return 'passenger_web';
  if (text.includes('[passenger_app]')) return 'passenger_app';
  if (text.includes('[street_hail]') || text.includes('viaje tomado en calle')) {
    return 'street_hail';
  }
  if (text.includes('[dashboard_assign]') || text.includes('[dashboard]')) return 'dashboard';
  if (
    text.includes('whatsapp')
    || text.includes('[wa_')
    || text.includes('[whatsapp]')
    || text.includes('cola de espera')
    || text.includes('[approach_only]')
  ) {
    return 'whatsapp';
  }
  return 'otro';
}
