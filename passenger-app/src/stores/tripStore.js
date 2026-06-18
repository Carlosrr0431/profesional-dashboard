import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ACTIVE_TRIP_KEY = '@passenger_active_trip';

export const useTripStore = create((set, get) => ({
  activeTrip: null,
  activeTripId: null,
  driverLocation: null,
  isCreating: false,
  /** Evita que Realtime vuelva a queued/pending tras cancelar en la app. */
  passengerCancelledTripId: null,

  setActiveTrip: async (trip) => {
    try {
      if (trip) {
        await AsyncStorage.setItem(ACTIVE_TRIP_KEY, JSON.stringify({ id: trip.id }));
      } else {
        await AsyncStorage.removeItem(ACTIVE_TRIP_KEY);
      }
    } catch (e) {
      console.error('Error persistiendo viaje activo:', e);
    }
    set({
      activeTrip: trip,
      activeTripId: trip?.id ?? null,
      driverLocation: null,
      passengerCancelledTripId:
        trip?.status === 'cancelled' ? get().passengerCancelledTripId : null,
    });
  },

  updateActiveTrip: (updates) =>
    set((state) => {
      if (!state.activeTrip) return { activeTrip: null };

      const nextStatus = updates?.status ?? state.activeTrip.status;
      const lockedCancelled =
        state.passengerCancelledTripId
        && state.passengerCancelledTripId === state.activeTrip.id
        && ['queued', 'pending'].includes(nextStatus);

      if (lockedCancelled) {
        return {};
      }

      return {
        activeTrip: { ...state.activeTrip, ...updates },
      };
    }),

  markPassengerCancelled: (tripId) =>
    set({ passengerCancelledTripId: tripId || null }),

  clearActiveTrip: async () => {
    try {
      await AsyncStorage.removeItem(ACTIVE_TRIP_KEY);
    } catch (e) {
      console.error('Error limpiando viaje activo:', e);
    }
    set({
      activeTrip: null,
      activeTripId: null,
      driverLocation: null,
      passengerCancelledTripId: null,
    });
  },

  updateDriverLocation: (location) =>
    set((state) => ({
      driverLocation: state.driverLocation
        ? { ...state.driverLocation, ...location }
        : location,
    })),

  setCreating: (isCreating) => set({ isCreating }),

  loadPersistedTripId: async () => {
    try {
      const raw = await AsyncStorage.getItem(ACTIVE_TRIP_KEY);
      if (raw) {
        const { id } = JSON.parse(raw);
        return id || null;
      }
    } catch (e) {
      console.error('Error cargando viaje persistido:', e);
    }
    return null;
  },
}));
