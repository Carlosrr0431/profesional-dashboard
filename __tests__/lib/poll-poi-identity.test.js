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
});
