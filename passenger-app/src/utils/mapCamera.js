/**
 * Controlador de cámara para Google Maps (react-native-maps).
 */
import { getRouteBounds, regionFromRouteBounds } from './mapCoords';

function buildEdgePadding(edgePadding = {}) {
  return {
    top: edgePadding.top ?? 48,
    right: edgePadding.right ?? 48,
    bottom: edgePadding.bottom ?? 48,
    left: edgePadding.left ?? 48,
  };
}

function adjustRegionForEdgePadding(region, edgePadding = {}, mapSize = {}) {
  if (!region) return null;

  const width = Number(mapSize.width) || 390;
  const height = Number(mapSize.height) || 844;
  const padding = buildEdgePadding(edgePadding);

  const visibleWidth = Math.max(width - padding.left - padding.right, width * 0.45);
  const visibleHeight = Math.max(height - padding.top - padding.bottom, height * 0.35);

  const latFactor = Math.min(1.45, height / visibleHeight);
  const lngFactor = Math.min(1.45, width / visibleWidth);

  return {
    ...region,
    latitudeDelta: Math.min(region.latitudeDelta * latFactor, 0.065),
    longitudeDelta: Math.min(region.longitudeDelta * lngFactor, 0.065),
  };
}

export function createMapCameraController(mapViewRef) {
  const toPaddingArray = (edgePadding = {}) => {
    const p = buildEdgePadding(edgePadding);
    return [p.top, p.right, p.bottom, p.left];
  };

  const regionToZoom = (latitudeDelta) => {
    const latDelta = Number(latitudeDelta) || 0.02;
    const zoom = Math.log2(360 / latDelta);
    return Math.max(11, Math.min(18.5, zoom));
  };

  return {
    animateToRegion(region, duration = 400) {
      if (!mapViewRef.current || !region) return;
      const latitude = Number(region.latitude);
      const longitude = Number(region.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
      mapViewRef.current.setCamera({
        centerCoordinate: [longitude, latitude],
        zoomLevel: regionToZoom(region.latitudeDelta),
        animationDuration: duration,
        animationMode: 'easeTo',
      });
    },

    fitToCoordinates(coords = [], { edgePadding = {}, animated = true } = {}) {
      const points = coords.filter(
        (p) => Number.isFinite(p?.latitude) && Number.isFinite(p?.longitude),
      );
      if (!mapViewRef?.current || points.length === 0) return;
      if (points.length === 1) {
        mapViewRef.current.setCamera({
          centerCoordinate: [points[0].longitude, points[0].latitude],
          zoomLevel: 16,
          animationDuration: animated ? 350 : 0,
          animationMode: 'easeTo',
        });
        return;
      }
      const lngs = points.map((p) => p.longitude);
      const lats = points.map((p) => p.latitude);
      mapViewRef.current.fitBounds(
        [Math.max(...lngs), Math.max(...lats)],
        [Math.min(...lngs), Math.min(...lats)],
        toPaddingArray(edgePadding),
        animated ? 450 : 0,
      );
    },

    /**
     * Encuadra la ruta usando solo origen/destino con zoom acotado (no aleja de más).
     */
    fitRouteToCoordinates(coords = [], { edgePadding = {}, animated = true } = {}) {
      const points = coords.filter(
        (p) => Number.isFinite(p?.latitude) && Number.isFinite(p?.longitude),
      );
      if (!mapViewRef?.current || points.length === 0) return;

      const fitPoints = points.length > 2
        ? [points[0], points[points.length - 1]]
        : points;

      const bounds = getRouteBounds(fitPoints);
      const baseRegion = regionFromRouteBounds(bounds, {
        paddingFactor: 1.28,
        minLatitudeDelta: 0.006,
        minLongitudeDelta: 0.006,
        maxLatitudeDelta: 0.055,
        maxLongitudeDelta: 0.055,
      });

      if (!baseRegion) return;

      const region = adjustRegionForEdgePadding(baseRegion, edgePadding);
      mapViewRef.current.setCamera({
        centerCoordinate: [region.longitude, region.latitude],
        zoomLevel: regionToZoom(region.latitudeDelta),
        animationDuration: animated ? 480 : 0,
        animationMode: 'easeTo',
      });
    },
  };
}
