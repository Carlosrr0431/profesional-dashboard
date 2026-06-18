/**
 * Capas de polilínea para MapLibre (borde + línea principal).
 */
import React, { useMemo } from 'react';
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { coordsToLineString } from '../../utils/mapLibreHelpers';

const DEFAULT_ROUTE_BLUE = '#4285F4';
const DEFAULT_ROUTE_CASING = '#FFFFFF';

export function MapRouteLayers({
  idPrefix = 'route',
  coords = [],
  navigationMode = false,
  lineColor = DEFAULT_ROUTE_BLUE,
  casingColor = DEFAULT_ROUTE_CASING,
  casingWidth,
  lineWidth,
}) {
  const feature = useMemo(() => coordsToLineString(coords), [coords]);
  if (!feature) return null;

  const resolvedCasingWidth = casingWidth ?? (navigationMode ? 16 : 9);
  const resolvedLineWidth = lineWidth ?? (navigationMode ? 11 : 5);

  return (
    <GeoJSONSource id={`${idPrefix}-source`} data={feature}>
      <Layer
        id={`${idPrefix}-casing`}
        type="line"
        style={{
          lineColor: casingColor,
          lineWidth: resolvedCasingWidth,
          lineCap: 'round',
          lineJoin: 'round',
        }}
      />
      <Layer
        id={`${idPrefix}-line`}
        type="line"
        style={{
          lineColor,
          lineWidth: resolvedLineWidth,
          lineCap: 'round',
          lineJoin: 'round',
        }}
      />
    </GeoJSONSource>
  );
}
