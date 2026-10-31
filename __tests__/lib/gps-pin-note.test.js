const { looksLikeGpsClarification, parseCalleCasaPickup } = require('../../src/lib/gpsPinNote');

describe('nota sobre un pin de GPS', () => {
  it('saca calle y casa aunque el barrio se llame Güemes', () => {
    const text = 'Barrio parque martin Miguel de guemes calle Mujica casa 9';
    expect(parseCalleCasaPickup(text)).toBe('mujica 9');
    expect(looksLikeGpsClarification(text)).toBe(true);
  });

  it('guarda un comentario como el baúl', () => {
    expect(looksLikeGpsClarification('que el auto tenga baul')).toBe(true);
  });

  it('no trata una dirección suelta como aclaración del pin', () => {
    expect(looksLikeGpsClarification('Mitre 200')).toBe(false);
  });
});
