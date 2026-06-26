/**
 * Polilíneas de ruta sobre Google Maps nativo (borde + línea estilo Google Maps).
 */
import React, { useMemo } from 'react';
import MapLibreGL from '../../lib/maplibre';
import { densifyRouteCoords, normalizeCoords } from '../../utils/mapCoords';
import {
  ROUTE_ACTIVE_STYLE,
  ROUTE_PREVIEW_STYLE,
} from '../../constants/mapStyle';

const STYLE_PRESETS = {
  preview: ROUTE_PREVIEW_STYLE,
  active: ROUTE_ACTIVE_STYLE,
};

export function MapRouteLayers({
  coords = [],
  navigationMode = false,
  variant = 'preview',
  idPrefix = 'route',
  lineColor,
  casingColor,
  outlineColor,
  outlineWidth,
  casingWidth,
  lineWidth,
  smooth = true,
}) {
  const preset = STYLE_PRESETS[variant] || ROUTE_PREVIEW_STYLE;

  const coordinates = useMemo(() => {
    const normalized = normalizeCoords(coords);
    if (!smooth || normalized.length < 2) return normalized;
    return densifyRouteCoords(normalized, navigationMode ? 14 : 18);
  }, [coords, navigationMode, smooth]);

  const routeFeature = useMemo(() => {
    if (coordinates.length < 2) return null;
    return {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: coordinates.map((point) => [point.longitude, point.latitude]),
      },
    };
  }, [coordinates]);

  if (!routeFeature) return null;

  const resolvedOutlineColor = outlineColor ?? preset.outlineColor;
  const resolvedCasingColor = casingColor ?? preset.casingColor;
  const resolvedLineColor = lineColor ?? preset.lineColor;

  const resolvedLineWidth = lineWidth
    ?? (navigationMode ? preset.lineWidth + 2 : preset.lineWidth);
  const resolvedCasingWidth = casingWidth
    ?? (navigationMode ? preset.casingWidth + 2 : preset.casingWidth);
  const resolvedOutlineWidth = outlineWidth
    ?? (navigationMode ? preset.outlineWidth + 2 : preset.outlineWidth);

  return (
    <MapLibreGL.ShapeSource id={`${idPrefix}-source`} shape={routeFeature}>
      <MapLibreGL.LineLayer
        id={`${idPrefix}-outline`}
        style={{
          lineColor: resolvedOutlineColor,
          lineWidth: resolvedOutlineWidth,
          lineCap: 'round',
          lineJoin: 'round',
        }}
      />
      <MapLibreGL.LineLayer
        id={`${idPrefix}-casing`}
        style={{
          lineColor: resolvedCasingColor,
          lineWidth: resolvedCasingWidth,
          lineCap: 'round',
          lineJoin: 'round',
        }}
      />
      <MapLibreGL.LineLayer
        id={`${idPrefix}-line`}
        style={{
          lineColor: resolvedLineColor,
          lineWidth: resolvedLineWidth,
          lineCap: 'round',
          lineJoin: 'round',
        }}
      />
    </MapLibreGL.ShapeSource>
  );
}
