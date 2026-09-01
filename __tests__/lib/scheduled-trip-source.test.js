const {
  parseScheduledSource,
  scheduledSourceLabel,
  isScheduledDispatchingStatus,
  scheduledPickupAddress,
  scheduledDestinationAddress,
} = require('../../src/lib/scheduledTripSource');

describe('scheduledTripSource', () => {
  it('lee SCHEDULED_SOURCE dashboard', () => {
    expect(parseScheduledSource({
      notes: '[DASHBOARD]\n[SCHEDULED_SOURCE] dashboard',
    })).toBe('dashboard');
    expect(scheduledSourceLabel('dashboard')).toBe('Panel');
  });

  it('lee app y web de pasajeros', () => {
    expect(parseScheduledSource({ notes: '[SCHEDULED_SOURCE] passenger_app' })).toBe('passenger_app');
    expect(parseScheduledSource({ notes: '[PASSENGER_WEB]\n[PASSENGER_APP]' })).toBe('passenger_web');
    expect(parseScheduledSource({ notes: '[PASSENGER_APP]' })).toBe('passenger_app');
    expect(scheduledSourceLabel('passenger_app')).toBe('App pasajeros');
    expect(scheduledSourceLabel('passenger_web')).toBe('Web pasajeros');
  });

  it('detecta WhatsApp por fallback y por tag', () => {
    expect(parseScheduledSource({ notes: '[SCHEDULED_FOR] 2026-08-31T20:00:00.000Z' })).toBe('whatsapp');
    expect(parseScheduledSource({ notes: '[SCHEDULED_SOURCE] whatsapp' })).toBe('whatsapp');
    expect(parseScheduledSource({ notes: 'En cola de espera. Retiro confirmado.' })).toBe('whatsapp');
    expect(scheduledSourceLabel('whatsapp')).toBe('WhatsApp');
  });

  it('prioriza [DASHBOARD] sobre el fallback de WhatsApp', () => {
    expect(parseScheduledSource({
      notes: '[DASHBOARD]\nViaje ingresado desde el panel de operaciones.',
    })).toBe('dashboard');
  });

  it('marca cola/pending como despachando', () => {
    expect(isScheduledDispatchingStatus('queued')).toBe(true);
    expect(isScheduledDispatchingStatus('pending')).toBe(true);
    expect(isScheduledDispatchingStatus('scheduled')).toBe(false);
    expect(isScheduledDispatchingStatus('accepted')).toBe(false);
  });

  it('usa origin_address como pickup del panel y destination si no hay origin', () => {
    expect(scheduledPickupAddress({
      origin_address: 'Mitre 200',
      destination_address: 'Caseros 100',
    })).toBe('Mitre 200');
    expect(scheduledPickupAddress({
      origin_address: null,
      destination_address: 'Belgrano 50',
    })).toBe('Belgrano 50');
    expect(scheduledDestinationAddress({
      origin_address: 'Mitre 200',
      destination_address: 'Caseros 100',
    })).toBe('Caseros 100');
    expect(scheduledDestinationAddress({
      origin_address: 'Mitre 200',
      destination_address: null,
    })).toBeNull();
  });
});
