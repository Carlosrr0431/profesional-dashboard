const {
  formatAddressForWhatsAppPoll,
  formatPollOptionLabel,
  extractStreetAddressForPoll,
  extractMunicipalityHint,
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

describe('extractMunicipalityHint', () => {
  it('marca Salta Capital con A4400', () => {
    expect(
      extractMunicipalityHint({
        formattedAddress: 'Belgrano 400, A4400 Salta, Argentina',
      })
    ).toBe('Salta Capital');
  });

  it('marca San Lorenzo desde el subtitle, no desde la calle', () => {
    expect(
      extractMunicipalityHint({
        title: 'Avenida Gral Manuel Belgrano 400',
        subtitle: 'San Lorenzo, Salta',
        formattedAddress: 'Avenida Gral Manuel Belgrano 400, San Lorenzo, Salta, Argentina',
      })
    ).toBe('San Lorenzo');
  });

  it('no confunde Calle San Lorenzo de Capital con el municipio', () => {
    expect(
      extractMunicipalityHint({
        title: 'Calle San Lorenzo 100',
        formattedAddress: 'Calle San Lorenzo 100, A4400 Salta, Argentina',
      })
    ).toBe('Salta Capital');
  });

  it('asume Salta Capital en candidatos del catálogo local', () => {
    expect(
      extractMunicipalityHint({
        pollLabel: 'Avenida Gral Manuel Belgrano 400',
        source: 'catalog_variant',
      })
    ).toBe('Salta Capital');
  });
});

describe('formatPollOptionLabel (POIs)', () => {
  it('no duplica Bartolomé si el texto ya dice Bartolomé Mitre', () => {
    expect(
      formatPollOptionLabel({
        title: 'Banco Macro',
        subtitle: 'Bartolomé Mitre 200, Salta',
      })
    ).toBe('Banco Macro · Bartolomé Mitre 200 · Salta Capital');
  });

  it('combina nombre del POI con calle y altura del subtitle', () => {
    expect(
      formatPollOptionLabel({
        title: 'Banco Macro',
        subtitle: 'Belgrano 700, Salta',
        formattedAddress: 'Banco Macro, Belgrano 700, Salta, Argentina',
      })
    ).toBe('Banco Macro · Belgrano 700 · Salta Capital');
  });

  it('extrae calle con altura aunque el formatted empiece con el POI', () => {
    expect(
      extractStreetAddressForPoll(
        null,
        'Banco Macro, Belgrano 700, A4400 Salta, Argentina',
      )
    ).toBe('Belgrano 700');
  });

  it('distingue sucursales con distinta calle', () => {
    expect(
      formatPollOptionLabel({
        title: 'Banco Macro',
        subtitle: 'España 500, Salta',
      })
    ).toBe('Banco Macro · España 500 · Salta Capital');
  });

  it('no duplica si el título ya es calle con altura', () => {
    expect(
      formatPollOptionLabel({
        title: 'Belgrano 700',
        subtitle: 'Belgrano 700, Salta',
        formattedAddress: 'Belgrano 700, A4400 Salta, Argentina',
      })
    ).toBe('Belgrano 700 · Salta Capital');
  });

  it('no duplica Nombre · Nombre cuando el subtitle es el mismo POI', () => {
    expect(
      formatPollOptionLabel({
        title: 'Plaza Palermo Salta',
        subtitle: 'Plaza Palermo Salta',
        formattedAddress: 'Plaza Palermo Salta, Salta, Argentina',
      })
    ).toBe('Plaza Palermo Salta · Salta Capital');
  });

  it('no duplica Cerro San Bernardo · Cerro San Bernardo', () => {
    expect(
      formatPollOptionLabel({
        title: 'Cerro San Bernardo',
        subtitle: 'Cerro San Bernardo',
        formattedAddress: 'Cerro San Bernardo, Salta, Argentina',
      })
    ).toBe('Cerro San Bernardo · Salta Capital');
  });

  it('normaliza intersección & a y en el label', () => {
    expect(
      formatPollOptionLabel({
        title: 'Alvarado & Santa Fe',
        formattedAddress: 'Alvarado & Santa Fe, Salta, Argentina',
      })
    ).toBe('Alvarado y Santa Fe · Salta Capital');
  });

  it('usa formattedAddress cuando no hay title de POI', () => {
    expect(
      formatPollOptionLabel({
        formattedAddress: 'Dr. A. Güemes 200, A4400 Salta, Argentina',
      })
    ).toBe('Dr. Adolfo Güemes 200 · Salta Capital');
  });

  it('muestra municipio en calles homónimas del catálogo', () => {
    expect(
      formatPollOptionLabel({
        pollLabel: 'Avenida Gral Manuel Belgrano 400',
        formattedAddress: 'Avenida Gral Manuel Belgrano 400, Salta Capital, Argentina',
        subtitle: 'Salta Capital',
        source: 'catalog_variant',
      })
    ).toBe('Avenida Gral Manuel Belgrano 400 · Salta Capital');
  });

  it('distingue el mismo nombre de calle en San Lorenzo', () => {
    expect(
      formatPollOptionLabel({
        title: 'Avenida Gral Manuel Belgrano 400',
        subtitle: 'San Lorenzo, Salta',
        formattedAddress: 'Avenida Gral Manuel Belgrano 400, San Lorenzo, Salta, Argentina',
      })
    ).toBe('Avenida Gral Manuel Belgrano 400 · San Lorenzo');
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

    expect(pollOptions[0]).toBe('Dr. Adolfo Güemes 200 · Salta Capital');
    expect(pollCandidates[0].formattedAddress).toBe('Dr. A. Güemes 200, A4400 Salta, Argentina');
    expect(pollOptions[pollOptions.length - 1]).toBe('Ninguna de estas opciones');
  });

  it('muestra calle/altura en opciones de banco/POI', () => {
    const { pollOptions } = buildAddressPollPayload([
      {
        title: 'Banco Macro',
        subtitle: 'Belgrano 700, Salta',
        formattedAddress: 'Banco Macro, Belgrano 700, Salta, Argentina',
      },
      {
        title: 'Cajero Automático Banco Macro',
        subtitle: 'Mitre 200, Salta',
        formattedAddress: 'Cajero Automático Banco Macro, Mitre 200, Salta, Argentina',
      },
    ]);

    expect(pollOptions[0]).toBe('Banco Macro · Belgrano 700 · Salta Capital');
    expect(pollOptions[1]).toBe('Cajero Automático Banco Macro · Bartolomé Mitre 200 · Salta Capital');
  });
});
