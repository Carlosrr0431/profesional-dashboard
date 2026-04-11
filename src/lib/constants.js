export const MAP_ID = 'dark-map';

export const SALTA_CENTER = {
  lat: -24.7821,
  lng: -65.4232,
};

export const DEFAULT_ZOOM = 13;

export const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1a2e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8888bb' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2a2a4a' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#363660' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#353565' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#454575' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#141428' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1c2e1c' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#363660' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#9999cc' }] },
];
