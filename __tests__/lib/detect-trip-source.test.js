const { detectTripSource, isPassengerChannelSource } = require('../../src/lib/detectTripSource');

describe('detectTripSource', () => {
  it('prioriza web aunque también tenga PASSENGER_APP', () => {
    expect(detectTripSource('[APPROACH_ONLY]\n[PASSENGER_APP]\n[PASSENGER_WEB]')).toBe('passenger_web');
  });

  it('detecta app nativa, dashboard y whatsapp', () => {
    expect(detectTripSource('[PASSENGER_APP]\nSolicitado desde la app')).toBe('passenger_app');
    expect(detectTripSource('[DASHBOARD]\nViaje ingresado')).toBe('dashboard');
    expect(detectTripSource('[APPROACH_ONLY]\nEn cola de espera. Retiro confirmado.')).toBe('whatsapp');
    expect(detectTripSource('[APPROACH_ONLY] Esperando selección de dirección.')).toBe('whatsapp');
  });

  it('detecta viaje en calle tomado por el chofer', () => {
    expect(detectTripSource('[STREET_HAIL]\nViaje tomado en calle. Destino a definir.')).toBe('street_hail');
    expect(detectTripSource('[STREET_HAIL]\n[PICKUP_JSON:{}]\n[FREE_RIDE]')).toBe('street_hail');
  });

  it('reconoce canales de pasajero', () => {
    expect(isPassengerChannelSource('passenger_web')).toBe(true);
    expect(isPassengerChannelSource('passenger_app')).toBe(true);
    expect(isPassengerChannelSource('dashboard')).toBe(false);
  });
});
