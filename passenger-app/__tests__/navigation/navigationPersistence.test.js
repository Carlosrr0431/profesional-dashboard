const AsyncStorage = require('@react-native-async-storage/async-storage');

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

const {
  clearNavigationState,
  loadNavigationState,
  saveNavigationState,
} = require('../../src/navigation/navigationPersistence');
const {
  NAVIGATION_STRUCTURE_FINGERPRINT,
} = require('../../src/navigation/navigationStructure');

describe('navigationPersistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('restaura un estado válido del main navigator', async () => {
    const state = {
      index: 0,
      routes: [{ name: 'HomeMain' }],
    };

    AsyncStorage.getItem.mockResolvedValue(
      JSON.stringify({ fingerprint: NAVIGATION_STRUCTURE_FINGERPRINT, state }),
    );

    await expect(loadNavigationState()).resolves.toEqual(state);
  });

  it('descarta estados con rutas de onboarding', async () => {
    AsyncStorage.getItem.mockResolvedValue(
      JSON.stringify({
        fingerprint: NAVIGATION_STRUCTURE_FINGERPRINT,
        state: {
          index: 0,
          routes: [{ name: 'Onboarding' }],
        },
      }),
    );

    await expect(loadNavigationState()).resolves.toBeUndefined();
    expect(AsyncStorage.removeItem).toHaveBeenCalled();
  });

  it('descarta fingerprints desconocidos', async () => {
    AsyncStorage.getItem.mockResolvedValue(
      JSON.stringify({
        fingerprint: 'estructura-vieja',
        state: {
          index: 0,
          routes: [{ name: 'HomeMain' }],
        },
      }),
    );

    await expect(loadNavigationState()).resolves.toBeUndefined();
    expect(AsyncStorage.removeItem).toHaveBeenCalled();
  });

  it('guarda pantallas internas como ActiveTrip', async () => {
    const state = {
      index: 0,
      routes: [{ name: 'ActiveTrip', params: { tripId: 'abc' } }],
    };

    await saveNavigationState(state);

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@passenger_app/navigation_state_v1',
      JSON.stringify({ fingerprint: NAVIGATION_STRUCTURE_FINGERPRINT, state }),
    );
  });

  it('limpia el storage persistido', async () => {
    await clearNavigationState();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(
      '@passenger_app/navigation_state_v1',
    );
  });
});
