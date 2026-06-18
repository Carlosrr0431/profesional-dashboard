const {
  buildPlaceKey,
  sortFrequentPlaces,
  extractDestinationFromTrip,
  addRecentPlace,
  loadFrequentPlaces,
} = require('../../src/services/recentPlaces');

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

const AsyncStorage = require('@react-native-async-storage/async-storage');

describe('recentPlaces', () => {
  test('buildPlaceKey prioriza placeId', () => {
    expect(buildPlaceKey({ placeId: 'abc', address: 'A', lat: 1, lng: 2 })).toBe('pid:abc');
  });

  test('sortFrequentPlaces ordena por visitas y luego por fecha', () => {
    const sorted = sortFrequentPlaces([
      { address: 'A', visitCount: 1, lastUsedAt: 100 },
      { address: 'B', visitCount: 3, lastUsedAt: 50 },
      { address: 'C', visitCount: 3, lastUsedAt: 200 },
    ]);
    expect(sorted.map((p) => p.address)).toEqual(['C', 'B', 'A']);
  });

  test('extractDestinationFromTrip solo toma viajes completados con coords', () => {
    const trip = {
      id: 't1',
      status: 'completed',
      notes: '[PASSENGER_APP]',
      destination_address: 'Belgrano 200, Salta',
      destination_lat: -24.79,
      destination_lng: -65.41,
      created_at: '2026-01-01T10:00:00.000Z',
    };
    expect(extractDestinationFromTrip(trip)).toMatchObject({
      address: 'Belgrano 200, Salta',
      lat: -24.79,
      lng: -65.41,
    });
    expect(extractDestinationFromTrip({ ...trip, status: 'cancelled' })).toBeNull();
  });

  test('addRecentPlace no incrementa viajes; loadFrequentPlaces cuenta solo completados', async () => {
    let stored = null;
    AsyncStorage.getItem.mockImplementation(() => Promise.resolve(stored));
    AsyncStorage.setItem.mockImplementation((_key, value) => {
      stored = value;
      return Promise.resolve();
    });

    const phone = '543878630173';
    const place = {
      address: 'Las Claveles 203, Salta',
      lat: -24.80196593,
      lng: -65.39452778,
    };

    await addRecentPlace(phone, place);

    const completedTrip = {
      id: 'trip-1',
      status: 'completed',
      notes: '[PASSENGER_APP]',
      destination_address: 'Las Claveles 203, Salta',
      destination_lat: -24.80196593,
      destination_lng: -65.39452778,
      completed_at: '2026-06-07T14:49:14.227Z',
    };

    const places = await loadFrequentPlaces(phone, async () => [completedTrip]);
    const claveles = places.find((p) => p.address.includes('Las Claveles'));

    expect(claveles?.visitCount).toBe(1);
  });
});
