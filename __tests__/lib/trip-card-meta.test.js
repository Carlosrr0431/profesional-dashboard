const {
  resolveAssignedDriver,
  resolveTripCreatedFrom,
  tripCreatedFromLabel,
  tripDisplayPassengerName,
  tripRouteAddresses,
} = require('../../src/lib/tripCardMeta');

describe('tripCardMeta', () => {
  it('prioriza viaje en calle sobre el fallback de panel', () => {
    expect(resolveTripCreatedFrom({
      passenger_name: 'Pasajero en calle',
      notes: '[STREET_HAIL]\nViaje tomado en calle.',
    })).toBe('street_hail');
    expect(tripCreatedFromLabel({ passengerName: 'Pasajero en calle' })).toBe('Viaje en calle');
  });

  it('lee canal de creación desde notes y scheduledSource', () => {
    expect(tripCreatedFromLabel({ notes: '[DASHBOARD]' })).toBe('Panel');
    expect(tripCreatedFromLabel({ notes: '[PASSENGER_APP]' })).toBe('App de pasajeros');
    expect(tripCreatedFromLabel({ notes: '[PASSENGER_WEB]' })).toBe('App web');
    expect(tripCreatedFromLabel({ notes: 'En cola de espera. Retiro confirmado.' })).toBe('WhatsApp');
    expect(tripCreatedFromLabel({ scheduledSource: 'passenger_app' })).toBe('App de pasajeros');
    expect(tripCreatedFromLabel({ notes: '' })).toBe('Panel');
  });

  it('oculta el nombre genérico Pasajero', () => {
    expect(tripDisplayPassengerName({ passengerName: 'Pasajero' })).toBeNull();
    expect(tripDisplayPassengerName({ passenger_name: 'Pasajero en calle' })).toBeNull();
    expect(tripDisplayPassengerName({ passengerName: 'Lucas Romero' })).toBe('Lucas Romero');
  });

  it('etiqueta origen y destino sin mezclarlos', () => {
    expect(tripRouteAddresses({
      driverOrigin: 'Juramento 173',
      destination: 'Caseros 100',
      pickupAddress: 'Caseros 100',
    })).toEqual({ pickup: 'Juramento 173', dest: 'Caseros 100' });

    expect(tripRouteAddresses({
      origin_address: 'Mitre 200',
      destination_address: 'Mitre 200',
    })).toEqual({ pickup: 'Mitre 200', dest: null });

    expect(tripRouteAddresses({
      origin_address: '-24.79433, -65.41738',
      origin_lat: -24.7943267,
      origin_lng: -65.417385,
      destination_address: 'Balcarce 1900',
      destination_lat: -24.7658441,
      destination_lng: -65.4098968,
      notes: '[APPROACH_ONLY]\n[DASHBOARD_ASSIGN]',
    })).toEqual({ pickup: 'Balcarce 1900', dest: null });
  });

  it('resuelve el número de móvil desde la lista de choferes', () => {
    const trip = {
      driver_id: 'drv-1',
      driver: { id: 'drv-1', full_name: 'Lucas Romero' },
    };
    const drivers = [
      { id: 'drv-1', fullName: 'Lucas Romero', driverNumber: 12 },
    ];
    expect(resolveAssignedDriver(trip, drivers)).toEqual({
      number: '12',
      name: 'Lucas Romero',
    });
  });
});
