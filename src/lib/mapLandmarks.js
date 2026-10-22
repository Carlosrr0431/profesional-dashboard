/**
 * Lugares fijos del mapa del panel. Coordenadas del edificio en OpenStreetMap,
 * para que se vean aunque las baldosas de Google oculten los puntos de interés.
 */
export const MAP_LANDMARKS = [
  {
    id: 'hospital_papa_francisco',
    kind: 'hospital',
    label: 'Papa Francisco',
    lat: -24.840368,
    lng: -65.3914422,
  },
  {
    id: 'hospital_san_bernardo',
    kind: 'hospital',
    label: 'San Bernardo',
    lat: -24.792105,
    lng: -65.3994998,
  },
  {
    id: 'hospital_milagro',
    kind: 'hospital',
    label: 'Señor del Milagro',
    lat: -24.7820634,
    lng: -65.4165537,
  },
  {
    id: 'hospital_materno',
    kind: 'hospital',
    label: 'Materno Infantil',
    lat: -24.7721645,
    lng: -65.4156215,
  },
  {
    id: 'hospital_militar',
    kind: 'hospital',
    label: 'Hospital Militar',
    lat: -24.76899,
    lng: -65.422324,
  },
  {
    id: 'terminal',
    kind: 'transport',
    glyph: 'T',
    label: 'Terminal',
    lat: -24.7955142,
    lng: -65.3985006,
  },
  {
    id: 'aeropuerto',
    kind: 'transport',
    glyph: 'A',
    label: 'Aeropuerto',
    lat: -24.8595387,
    lng: -65.4881531,
  },
  {
    id: 'estacion',
    kind: 'transport',
    glyph: 'E',
    label: 'Estación',
    lat: -24.7771893,
    lng: -65.4111904,
  },
];
