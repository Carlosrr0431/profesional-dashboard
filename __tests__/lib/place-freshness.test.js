const {
  PLACE_MOVED_METERS,
  PLACE_REFRESH_AFTER_MS,
  isRefreshableGooglePlace,
  placeMoved,
  placeNeedsRefresh,
  rankNamedGoogleFirst,
  titleMatchesQuery,
} = require('../../shared/geo/placeFreshness');

describe('frescura de un local guardado', () => {
  const now = Date.parse('2026-10-26T22:00:00.000Z');

  it('revalida recién a los 30 días', () => {
    expect(PLACE_REFRESH_AFTER_MS).toBe(30 * 24 * 60 * 60 * 1000);
    expect(PLACE_MOVED_METERS).toBe(150);
    expect(placeNeedsRefresh('2026-10-01T22:00:00.000Z', now)).toBe(false);
    expect(placeNeedsRefresh('2026-09-26T22:00:00.000Z', now)).toBe(true);
    expect(placeNeedsRefresh(null, now)).toBe(false);
  });

  it('un restaurante de Google se revisa y una calle o un viaje no', () => {
    expect(isRefreshableGooglePlace({
      placeId: 'google:monumental',
      types: ['restaurant'],
      title: 'La Monumental',
    })).toBe(true);
    expect(isRefreshableGooglePlace({
      placeId: 'google:balcarce',
      types: ['route'],
      title: 'Balcarce',
    })).toBe(false);
    expect(isRefreshableGooglePlace({
      placeId: 'google:altura',
      types: [],
      title: 'Balcarce 450',
    })).toBe(false);
    expect(isRefreshableGooglePlace({
      placeId: 'street:Pasaje%20Iruya',
      types: [],
      title: 'Pasaje Iruya',
    })).toBe(false);
  });

  it('detecta una mudanza y deja primero el local actualizado', () => {
    expect(placeMoved(-24.78, -65.41, -24.78, -65.4104)).toBe(false);
    expect(placeMoved(-24.78, -65.41, -24.785, -65.41)).toBe(true);
    expect(titleMatchesQuery('La Monumental', 'monumental')).toBe(true);
    const items = [
      { placeId: 'trip:1', title: 'La Monumental', address: 'Calle vieja 100' },
      { placeId: 'google:nueva', title: 'La Monumental', address: 'Calle nueva 200' },
    ];
    expect(rankNamedGoogleFirst(items, 'monumental')[0].placeId).toBe('google:nueva');
    expect(rankNamedGoogleFirst(items, 'belgrano 1200')[0].placeId).toBe('trip:1');
  });
});
