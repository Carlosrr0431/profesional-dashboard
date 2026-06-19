/** Config de mapa para componentes cliente (sin imports de Node). */
export const MAP_STYLE_URL =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL
  || 'https://tiles.openfreemap.org/styles/liberty';

export const DEFAULT_MAP_VIEW = {
  longitude: -65.4122,
  latitude: -24.7829,
  zoom: 13,
};

export const mapLibreOptions = {
  attributionControl: false,
  maxPitch: 0,
  cooperativeGestures: false,
};
