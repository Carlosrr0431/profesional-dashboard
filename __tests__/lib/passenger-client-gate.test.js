const {
  isAllowedPassengerClient,
  readPassengerClientHeader,
  assertPassengerClient,
} = require('../../src/lib/passengerClientGate');

describe('passengerClientGate', () => {
  it('acepta passenger-app/versión', () => {
    expect(isAllowedPassengerClient('passenger-app/1.0.12')).toBe(true);
    expect(isAllowedPassengerClient('passenger-app/1.0.13')).toBe(true);
  });

  it('rechaza vacío, bots y otros clientes', () => {
    expect(isAllowedPassengerClient('')).toBe(false);
    expect(isAllowedPassengerClient(null)).toBe(false);
    expect(isAllowedPassengerClient('okhttp/4.12.0')).toBe(false);
    expect(isAllowedPassengerClient('passenger-app/')).toBe(false);
    expect(isAllowedPassengerClient('driver-app/1.0.0')).toBe(false);
  });

  it('lee header desde request', () => {
    const req = {
      headers: {
        get: (name) => (name === 'x-profesional-client' ? 'passenger-app/1.0.12' : null),
      },
    };
    expect(readPassengerClientHeader(req)).toBe('passenger-app/1.0.12');
    expect(assertPassengerClient(req).ok).toBe(true);
  });
});
