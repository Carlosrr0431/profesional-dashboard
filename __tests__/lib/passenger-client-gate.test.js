const {
  isAllowedPassengerClient,
  isLikelyAutomatedScannerIp,
  resolvePassengerClient,
} = require('../../src/lib/passengerClientGate');

describe('passengerClientGate', () => {
  it('acepta passenger-app/versión', () => {
    expect(isAllowedPassengerClient('passenger-app/1.0.12')).toBe(true);
    expect(isAllowedPassengerClient('passenger-app/1.0.14')).toBe(true);
  });

  it('rechaza vacío y otros clientes', () => {
    expect(isAllowedPassengerClient('')).toBe(false);
    expect(isAllowedPassengerClient('okhttp/4.12.0')).toBe(false);
    expect(isAllowedPassengerClient('passenger-app/')).toBe(false);
  });

  it('resuelve client desde header o body', () => {
    const req = {
      headers: {
        get: (name) => (name === 'x-profesional-client' ? 'passenger-app/1.0.14' : null),
      },
    };
    expect(resolvePassengerClient(req).ok).toBe(true);
    expect(resolvePassengerClient({ headers: { get: () => null } }, {
      client: 'passenger-app/1.0.14',
    }).source).toBe('body');
  });

  it('detecta IPs de scanners Google', () => {
    expect(isLikelyAutomatedScannerIp('66.102.8.230')).toBe(true);
    expect(isLikelyAutomatedScannerIp('181.15.10.2')).toBe(false);
  });
});
