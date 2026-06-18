const {
  formatAddressForWhatsAppPoll,
  buildAddressPollPayload,
} = require('../../src/lib/formatPollAddressLabel');

describe('formatAddressForWhatsAppPoll', () => {
  it('expande Dr. A. Güemes y quita CP/país', () => {
    expect(
      formatAddressForWhatsAppPoll('Dr. A. Güemes 200, A4400 Salta, Argentina')
    ).toBe('Dr. Adolfo Güemes 200');
  });

  it('mantiene Dr. Juan Manuel Güemes sin sufijo', () => {
    expect(
      formatAddressForWhatsAppPoll('Dr. Juan Manuel Güemes 200, A4400 Salta, Argentina')
    ).toBe('Dr. Juan Manuel Güemes 200');
  });

  it('expande Gral. Martin Güemes', () => {
    expect(
      formatAddressForWhatsAppPoll('Gral. Martin Güemes 200, A4400 Salta, Argentina')
    ).toBe('General Martín Güemes 200');
  });

  it('expande Mitre a Bartolomé Mitre', () => {
    expect(
      formatAddressForWhatsAppPoll('Mitre 351, A4400 Salta, Argentina')
    ).toBe('Bartolomé Mitre 351');
  });
});

describe('buildAddressPollPayload', () => {
  it('usa label legible pero conserva formattedAddress original', () => {
    const { pollOptions, pollCandidates } = buildAddressPollPayload([
      {
        formattedAddress: 'Dr. A. Güemes 200, A4400 Salta, Argentina',
        lat: -24.78,
        lng: -65.43,
      },
    ]);

    expect(pollOptions[0]).toBe('Dr. Adolfo Güemes 200');
    expect(pollCandidates[0].formattedAddress).toBe('Dr. A. Güemes 200, A4400 Salta, Argentina');
    expect(pollOptions[pollOptions.length - 1]).toBe('Ninguna de estas opciones');
  });
});
