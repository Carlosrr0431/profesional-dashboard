/**
 * Polilíneas de ruta OSRM con MapLibre Native (ShapeSource + LineLayer).
 */
import React, { useMemo } from 'react';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { normalizeCoords } from '../../utils/mapCoords';

const DEFAULT_ROUTE_BLUE = '#4285F4';
const DEFAULT_ROUTE_CASING = '#FFFFFF';

export function MapRouteLayers({
  coords = [],
  navigationMode = false,
  lineColor = DEFAULT_ROUTE_BLUE,
  casingColor = DEFAULT_ROUTE_CASING,
  casingWidth,
  lineWidth,
}) {
  const coordinates = useMemo(() => normalizeCoords(coords), [coords]);

  const geoJSON = useMemo(() => {
    if (coordinates.length < 2) return null;
    return {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        // MapLibre GeoJSON: [lng, lat]
        coordinates: coordinates.map((c) => [c.longitude, c.latitude]),
      },
    };
  }, [coordinates]);

  if (!geoJSON) return null;

  const resolvedCasingWidth = casingWidth ?? (navigationMode ? 16 : 9);
  const resolvedLineWidth = lineWidth ?? (navigationMode ? 11 : 5);

  return (
    <MapLibreGL.ShapeSource id="osrm-route-source" shape={geoJSON}>
      {/* Borde blanco exterior */}
      <MapLibreGL.LineLayer
        id="osrm-route-casing"
        style={{
          lineColor: casingColor,
          lineWidth: resolvedCasingWidth,
          lineCap: 'round',
          lineJoin: 'round',
          lineOpacity: 0.95,
        }}
        belowLayerID="osrm-route-line"
      />
      {/* Línea de color principal */}
      <MapLibreGL.LineLayer
        id="osrm-route-line"
        style={{
          lineColor: lineColor,
          lineWidth: resolvedLineWidth,
          lineCap: 'round',
          lineJoin: 'round',
          lineOpacity: 0.92,
        }}
      />
    </MapLibreGL.ShapeSource>
  );
}
