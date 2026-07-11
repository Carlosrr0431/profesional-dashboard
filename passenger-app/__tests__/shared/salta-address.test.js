const {
  normalizeAddressPhrase,
  buildAddressSearchQueries,
  getCatalogAddressVariants,
  scoreCandidateAgainstQuery,
  formatAddressSuggestion,
  formatNominatimDisplayLabel,
  applyQueryHouseNumberToLabel,
  parseStreetHouseFromQuery,
} = require('../../shared/salta-address');

describe('salta-address', () => {
  it('normaliza "mitre 350" con corrección fonética', () => {
    expect(normalizeAddressPhrase('mitre 350')).toBe('Mitre 350');
  });

  it('corrige errores fonéticos comunes', () => {
    expect(normalizeAddressPhrase('valgrano 200')).toBe('Belgrano 200');
    expect(normalizeAddressPhrase('mitra 350')).toBe('Mitre 350');
    expect(normalizeAddressPhrase('belgrano al 200')).toBe('belgrano 200');
  });

  it('genera variantes de búsqueda para "mitre 350" incluyendo Bartolomé Mitre', () => {
    const variants = buildAddressSearchQueries('mitre 350');
    expect(variants.length).toBeGreaterThan(1);
    expect(variants.some((v) => /bartolom[eé]\s+mitre/i.test(v))).toBe(true);
    expect(variants.some((v) => /\b350\b/.test(v))).toBe(true);
    expect(/bartolom[eé]\s+mitre/i.test(variants[0])).toBe(true);
  });

  it('formatea sugerencias con título y subtítulo estilo DiDi', () => {
    const formatted = formatAddressSuggestion('Bartolomé Mitre 200, A4400 Salta, Argentina');
    expect(formatted.title).toBe('Bartolomé Mitre 200');
    expect(formatted.subtitle).toContain('Salta');
  });

  it('parsea calle y altura desde el texto ingresado', () => {
    expect(parseStreetHouseFromQuery('belgrano 200')).toEqual({
      street: 'belgrano',
      houseNumber: '200',
    });
  });

  it('agrega la altura del query cuando Nominatim solo devuelve la calle', () => {
    const label = applyQueryHouseNumberToLabel(
      {
        title: 'Juan Gálvez',
        subtitle: 'Centro, Salta',
        full: 'Juan Gálvez, Centro, Salta',
      },
      'juan galvez 218',
    );
    expect(label.title).toBe('Juan Gálvez 218');
    expect(label.full).toContain('218');
  });

  it('formatea etiqueta corta desde addressdetails de Nominatim', () => {
    const label = formatNominatimDisplayLabel({
      formattedAddress: '200, Avenida Belgrano, Centro, Salta, Argentina',
      address: {
        house_number: '200',
        road: 'Avenida Belgrano',
        suburb: 'Centro',
        city: 'Salta',
      },
    });
    expect(label.title).toMatch(/Belgrano/i);
    expect(label.title).toContain('200');
    expect(label.subtitle).toContain('Salta');
  });

  it('resuelve calles del catálogo por token parcial', () => {
    const catalog = getCatalogAddressVariants('mitre 350', 4);
    expect(catalog.length).toBeGreaterThan(0);
    expect(catalog.some((v) => /mitre/i.test(v) && /350/.test(v))).toBe(true);
  });

  it('normaliza abreviaturas de tipo de vía', () => {
    expect(normalizeAddressPhrase('av belgrano 100')).toBe('Avenida belgrano 100');
    expect(normalizeAddressPhrase('pje san martin 50')).toContain('Pasaje');
  });

  it('prioriza Mitre 200 en Salta Capital sobre alturas lejanas o Gran Salta', () => {
    const exact = scoreCandidateAgainstQuery(
      'Bartolomé Mitre 200, A4400 Salta, Argentina',
      'mitre 200'
    );
    const range = scoreCandidateAgainstQuery(
      'Bartolomé Mitre 200-298, Salta, Argentina',
      'mitre 200'
    );
    const farNum = scoreCandidateAgainstQuery(
      'Bartolomé Mitre 2000, Villa San Lorenzo, Salta, Argentina',
      'mitre 200'
    );
    const cerrillos = scoreCandidateAgainstQuery(
      'Mitre, Cerrillos, Salta, Argentina',
      'mitre 200'
    );

    expect(exact).toBeGreaterThan(farNum);
    expect(range).toBeGreaterThan(farNum);
    expect(exact).toBeGreaterThan(cerrillos);
  });
});
