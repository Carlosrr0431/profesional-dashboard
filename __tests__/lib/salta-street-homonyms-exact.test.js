const {
  preferExactCatalogStreetMatches,
  isGuemesHomonymQuery,
  ambiguousGuemesSearchQuery,
} = require('../../src/lib/saltaStreetHomonyms');

describe('preferExactCatalogStreetMatches', () => {
  const alvaradoCandidates = [
    { street: { nameKey: 'alvarado', fullLabel: 'Calle Alvarado' }, score: 1.6, exactNameMatch: true },
    { street: { nameKey: 'c barbaran alvarado', fullLabel: 'Calle C Barbaran Alvarado' }, score: 0.7 },
    { street: { nameKey: 'gral r alvarado', fullLabel: 'Calle Gral R Alvarado' }, score: 0.7 },
    { street: { nameKey: 'mtro r alvarado', fullLabel: 'Calle Mtro R Alvarado' }, score: 0.7 },
  ];

  it('para "alvarado" deja solo Calle Alvarado y descarta compuestos', () => {
    const result = preferExactCatalogStreetMatches(alvaradoCandidates, ['alvarado'], 'alvarado');
    expect(result).toHaveLength(1);
    expect(result[0].street.nameKey).toBe('alvarado');
  });

  it('no filtra Güemes (homónimos reales)', () => {
    const guemes = [
      { street: { nameKey: 'dr adolfo guemes' }, score: 1 },
      { street: { nameKey: 'gral guemes' }, score: 1 },
    ];
    expect(isGuemesHomonymQuery('guemes', ['guemes'])).toBe(true);
    const result = preferExactCatalogStreetMatches(guemes, ['guemes'], 'guemes');
    expect(result).toHaveLength(2);
  });

  it('si no hay match exacto, conserva todos', () => {
    const onlyCompounds = alvaradoCandidates.filter((c) => c.street.nameKey !== 'alvarado');
    const result = preferExactCatalogStreetMatches(onlyCompounds, ['alvarado'], 'alvarado');
    expect(result).toHaveLength(3);
  });
});

describe('isGuemesHomonymQuery', () => {
  it('pide poll si el pasajero dijo solo Güemes + altura', () => {
    expect(isGuemesHomonymQuery('Güemes 300, Salta')).toBe(true);
    expect(isGuemesHomonymQuery('me mandas un remis para guemes al 300')).toBe(true);
  });

  it('sigue siendo ambiguo si el modelo expandió a Gral. Martín Güemes', () => {
    expect(isGuemesHomonymQuery('Gral. Martin Güemes 300, A4400 Salta, Argentina')).toBe(true);
    expect(ambiguousGuemesSearchQuery('Gral. Martin Güemes 300, Salta')).toBe('Güemes 300, Salta');
  });

  it('no pide poll si el pasajero nombró una Güemes concreta', () => {
    expect(isGuemesHomonymQuery('Dr. Adolfo Güemes 300')).toBe(false);
    expect(isGuemesHomonymQuery('juan manuel guemes 200')).toBe(false);
  });
});

