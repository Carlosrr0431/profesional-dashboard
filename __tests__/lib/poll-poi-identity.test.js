const {
  collapseEquivalentPollCandidates,
  getAddressPollIdentityKey,
} = require('../../src/lib/whatsappTripAddressParse');

describe('collapseEquivalentPollCandidates (POIs)', () => {
  it('no colapsa el mismo hospital con distintas calles', () => {
    const collapsed = collapseEquivalentPollCandidates([
      {
        title: 'Hospital San Bernardo',
        subtitle: 'Doctor Mariano Boedo, Salta',
        formattedAddress: 'Hospital San Bernardo, Doctor Mariano Boedo, Salta',
        score: 0.9,
      },
      {
        title: 'Hospital San Bernardo',
        subtitle: 'Avenida Colón Sur, Salta',
        formattedAddress: 'Hospital San Bernardo, Avenida Colón Sur, Salta',
        score: 0.8,
      },
    ]);

    expect(collapsed).toHaveLength(2);
    expect(getAddressPollIdentityKey(collapsed[0])).not.toBe(
      getAddressPollIdentityKey(collapsed[1]),
    );
  });

  it('colapsa el mismo POI con y sin altura y se queda con la numerada', () => {
    const collapsed = collapseEquivalentPollCandidates([
      {
        title: 'Carrefour Hipermercado Salta Capital II',
        subtitle: 'Avenida Entre Ríos 1816',
        formattedAddress: 'Carrefour Hipermercado Salta Capital II, Avenida Entre Ríos 1816, Salta',
        score: 0.88,
      },
      {
        title: 'Carrefour Hipermercado Salta Capital II',
        subtitle: 'Avenida Entre Ríos',
        formattedAddress: 'Carrefour Hipermercado Salta Capital II, Avenida Entre Ríos, Salta',
        score: 0.91,
      },
    ]);

    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].subtitle).toMatch(/1816/);
  });
});
