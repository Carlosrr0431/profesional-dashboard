const { lostOfferIdsToReopen } = require('../../src/lib/driverReleaseTrip');

describe('reabrir ofertas bloqueadas', () => {
  it('vuelve a ofrecer solo a quienes quedaron bloqueados', () => {
    const ids = lostOfferIdsToReopen([
      { id: 'a', driver_id: 'acepto', status: 'accepted' },
      { id: 'b', driver_id: 'bloqueo', status: 'lost' },
      { id: 'c', driver_id: 'rechazo', status: 'rejected' },
    ], 'acepto');
    expect(ids).toEqual(['b']);
  });

  it('no reabre al chofer que canceló aunque su fila figure perdida', () => {
    expect(lostOfferIdsToReopen([
      { id: 'a', driver_id: 'acepto', status: 'lost' },
    ], 'acepto')).toEqual([]);
  });
});
