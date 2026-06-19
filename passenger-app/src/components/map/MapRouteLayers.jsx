/**
 * Polilíneas de ruta OSRM sobre react-native-maps (borde + línea estilo Google Maps).
 */
import React, { useMemo } from 'react';
import { Polyline } from 'react-native-maps';
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

  if (coordinates.length < 2) return null;

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
    <>
      <Polyline
        coordinates={coordinates}
        strokeColor={resolvedOutlineColor}
        strokeWidth={resolvedOutlineWidth}
        lineCap="round"
        lineJoin="round"
        geodesic
      />
      <Polyline
        coordinates={coordinates}
        strokeColor={resolvedCasingColor}
        strokeWidth={resolvedCasingWidth}
        lineCap="round"
        lineJoin="round"
        geodesic
      />
      <Polyline
        coordinates={coordinates}
        strokeColor={resolvedLineColor}
        strokeWidth={resolvedLineWidth}
        lineCap="round"
        lineJoin="round"
        geodesic
      />
    </>
  );
}
