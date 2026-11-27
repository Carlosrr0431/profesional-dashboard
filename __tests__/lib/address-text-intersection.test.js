const {
  looksLikeAddressText,
  classifyWhatsAppIncomingText,
} = require('../../src/lib/whatsappTripIntentPatterns');

describe('looksLikeAddressText con esquinas escritas con c/, esq. o casi', () => {
  it.each([
    'España c/ Alvarado',
    'Caseros casi Mitre',
    'San Martín esq. Urquiza',
    'Caseros esquina Mitre',
  ])('toma "%s" como dirección', (text) => {
    expect(looksLikeAddressText(text)).toBe(true);
  });

  it.each([
    'ya casi llego',
    'estoy casi en la puerta',
    'hola casi te olvido',
    'gracias casi todo bien',
  ])('no toma "%s" como dirección', (text) => {
    expect(looksLikeAddressText(text)).toBe(false);
  });

  it('una esquina sola se clasifica como dirección del viaje', () => {
    const classified = classifyWhatsAppIncomingText('Caseros casi Mitre');
    expect(classified.intentHint).toBe('trip_request');
    expect(classified.category).toBe('address_reply');
  });

  it('un mensaje con "casi" que no es dirección sigue siendo conversación', () => {
    expect(classifyWhatsAppIncomingText('ya casi llego').intentHint).toBe('other');
  });
});
