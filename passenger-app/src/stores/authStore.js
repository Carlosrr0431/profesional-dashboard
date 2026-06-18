import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizePassengerPhone } from '../utils/phone';

const PROFILE_KEY = '@passenger_profile';

function isSessionValid(profile) {
  if (!profile?.phone || !profile?.sessionToken) return false;
  if (!profile?.sessionExpiresAt) return true;
  const expiresAt = Date.parse(profile.sessionExpiresAt);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

export const useAuthStore = create((set) => ({
  profile: null,
  isLoading: true,
  hasProfile: false,

  setProfile: (profile) =>
    set({
      profile,
      hasProfile: isSessionValid(profile),
    }),

  setLoading: (isLoading) => set({ isLoading }),

  saveProfile: async (profile) => {
    try {
      const normalized = {
        ...profile,
        phone: normalizePassengerPhone(profile?.phone),
      };
      if (!normalized.phone || !normalized.sessionToken) {
        return false;
      }
      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(normalized));
      set({ profile: normalized, hasProfile: isSessionValid(normalized) });
      return true;
    } catch (e) {
      console.error('Error guardando perfil:', e);
      return false;
    }
  },

  updateProfileFields: async (fields) => {
    try {
      const raw = await AsyncStorage.getItem(PROFILE_KEY);
      const current = raw ? JSON.parse(raw) : {};
      const next = {
        ...current,
        ...fields,
        phone: normalizePassengerPhone(fields?.phone ?? current?.phone),
      };
      if (!isSessionValid(next)) return false;
      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(next));
      set({ profile: next, hasProfile: true });
      return true;
    } catch (e) {
      console.error('Error actualizando perfil:', e);
      return false;
    }
  },

  clearProfile: async () => {
    try {
      await AsyncStorage.removeItem(PROFILE_KEY);
      set({ profile: null, hasProfile: false });
    } catch (e) {
      console.error('Error borrando perfil:', e);
    }
  },
}));

export { isSessionValid };
