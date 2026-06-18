/** Estilo de mapa claro (menos ruido visual, similar a apps de movilidad). */
export const PASSENGER_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#EEF1F5' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#7B8798' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#E3E8EF' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#F5F7FA' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#D7DEE8' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#C5DAF2' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#E8EBF0' }] },
];

export const ROUTE_LINE = '#0F172A';
export const ROUTE_CASING = '#FFFFFF';
