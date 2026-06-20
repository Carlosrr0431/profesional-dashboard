/**
 * Estilo de mapa inline para MapLibre Native.
 * Usa tiles raster ESRI World Street Map — fondo blanco, calles con jerarquía de colores,
 * estética similar a Google Maps. No requiere API key ni fetch de JSON externo.
 */
export const MAPLIBRE_STYLE = {
  version: 8,
  sources: {
    'esri-world-street': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution: '© Esri',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#f9f9f9' },
    },
    {
      id: 'esri-tiles',
      type: 'raster',
      source: 'esri-world-street',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

/**
 * URL de estilo alternativo (vectorial, requiere conectividad a OpenFreeMap).
 * Usar solo si el estilo inline no es suficiente.
 */
export const MAPLIBRE_STYLE_URL = 'https://tiles.openfreemap.org/styles/bright';
