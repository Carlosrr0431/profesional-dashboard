const { detectTripSource, isPassengerChannelSource } = require('../../src/lib/detectTripSource');

describe('detectTripSource', () => {
  it('prioriza web aunque también tenga PASSENGER_APP', () => {
    expect(detectTripSource('[APPROACH_ONLY]\n[PASSENGER_APP]\n[PASSENGER_WEB]')).toBe('passenger_web');
  });

  it('detecta app nativa, dashboard y whatsapp', () => {
    expect(detectTripSource('[PASSENGER_APP]\nSolicitado desde la app')).toBe('passenger_app');
    expect(detectTripSource('[DASHBOARD]\nViaje ingresado')).toBe('dashboard');
    expect(detectTripSource('[APPROACH_ONLY]\nEn cola de espera. Retiro confirmado.')).toBe('whatsapp');
  });

  it('reconoce canales de pasajero', () => {
    expect(isPassengerChannelSource('passenger_web')).toBe(true);
    expect(isPassengerChannelSource('passenger_app')).toBe(true);
    expect(isPassengerChannelSource('dashboard')).toBe(false);
  });
});
