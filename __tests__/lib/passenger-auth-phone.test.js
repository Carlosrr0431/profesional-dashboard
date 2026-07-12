const {
  extractLocalArMobileDigits,
  normalizePassengerPhoneForDb,
  normalizePhoneForWhatsApp,
  toWhatsAppJid,
} = require('../../src/lib/passengerAuthPhone');

describe('passengerAuthPhone', () => {
  const local = '3878630173';
  const db = `54${local}`;
  const wa = `549${local}`;

  it.each([
    ['3878630173', local],
    ['03878630173', local],
    ['93878630173', local],
    ['543878630173', local],
    ['5493878630173', local],
    ['+54 387 863-0173', local],
    ['+54 9 387 863-0173', local],
    ['005493878630173', local],
    ['5493878630173@s.whatsapp.net', local],
  ])('extrae local desde %s', (input, expected) => {
    expect(extractLocalArMobileDigits(input)).toBe(expected);
  });

  it('normaliza a canónico de DB (54 + 10) desde cualquier formato', () => {
    expect(normalizePassengerPhoneForDb('3878630173')).toBe(db);
    expect(normalizePassengerPhoneForDb('5493878630173')).toBe(db);
    expect(normalizePassengerPhoneForDb('543878630173')).toBe(db);
    expect(normalizePassengerPhoneForDb('93878630173')).toBe(db);
    expect(normalizePassengerPhoneForDb('+54 9 387 863-0173')).toBe(db);
  });

  it('normaliza a canónico de WhatsApp (549 + 10)', () => {
    expect(normalizePhoneForWhatsApp('3878630173')).toBe(wa);
    expect(normalizePhoneForWhatsApp('543878630173')).toBe(wa);
    expect(normalizePhoneForWhatsApp('5493878630173')).toBe(wa);
    expect(toWhatsAppJid('3874001234')).toBe('5493874001234@s.whatsapp.net');
  });

  it('rechaza entradas incompletas o inválidas', () => {
    expect(normalizePassengerPhoneForDb('387863')).toBe('');
    expect(normalizePassengerPhoneForDb('')).toBe('');
    expect(toWhatsAppJid('123')).toBeNull();
  });

  it('limpia formato viejo con 15 tras el área', () => {
    expect(normalizePhoneForWhatsApp('549387158630173')).toBe('5493878630173');
    expect(normalizePassengerPhoneForDb('549387158630173')).toBe('543878630173');
  });
});
