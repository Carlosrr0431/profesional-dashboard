'use client';

import { useJsApiLoader } from '@react-google-maps/api';

const LIBRARIES = [];

export const GOOGLE_MAPS_KEY =
  (typeof process !== 'undefined' &&
    (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || '')) ||
  '';

export const GOOGLE_MAPS_LIBRARIES = LIBRARIES;

export function useGoogleMapsLoader() {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'profesional-dashboard-google-maps',
    googleMapsApiKey: GOOGLE_MAPS_KEY,
    libraries: LIBRARIES,
  });

  return {
    isLoaded: Boolean(GOOGLE_MAPS_KEY) && isLoaded,
    loadError: !GOOGLE_MAPS_KEY ? new Error('Falta NEXT_PUBLIC_GOOGLE_MAPS_API_KEY') : loadError,
  };
}

export function isGoogleMapsPlacesReady() {
  return Boolean(typeof window !== 'undefined' && window.google?.maps?.places);
}
