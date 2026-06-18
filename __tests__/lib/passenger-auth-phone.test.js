const {
  normalizePassengerPhoneForDb,
  normalizePhoneForWhatsApp,
  toWhatsAppJid,
} = require('../../src/lib/passengerAuthPhone');

describe('passengerAuthPhone', () => {
  it('normaliza teléfono local AR para la base de datos', () => {
    expect(normalizePassengerPhoneForDb('3874001234')).toBe('543874001234');
    expect(normalizePassengerPhoneForDb('543874001234')).toBe('543874001234');
  });

  it('normaliza teléfono para WhatsApp con prefijo 549', () => {
    expect(normalizePhoneForWhatsApp('543874001234')).toBe('5493874001234');
    expect(toWhatsAppJid('3874001234')).toBe('5493874001234@s.whatsapp.net');
  });
});
