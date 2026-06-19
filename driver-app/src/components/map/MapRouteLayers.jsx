/**
 * Polilíneas de ruta OSRM sobre react-native-maps (borde + línea).
 */
import React, { useMemo } from 'react';
import { Polyline } from 'react-native-maps';
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
  if (coordinates.length < 2) return null;

  const resolvedCasingWidth = casingWidth ?? (navigationMode ? 16 : 9);
  const resolvedLineWidth = lineWidth ?? (navigationMode ? 11 : 5);

  return (
    <>
      <Polyline
        coordinates={coordinates}
        strokeColor={casingColor}
        strokeWidth={resolvedCasingWidth}
        lineCap="round"
        lineJoin="round"
      />
      <Polyline
        coordinates={coordinates}
        strokeColor={lineColor}
        strokeWidth={resolvedLineWidth}
        lineCap="round"
        lineJoin="round"
      />
    </>
  );
}
