import { getBoundsForCoords, regionToInitialViewState } from './mapLibreHelpers';

/**
 * API compatible con react-native-maps para migrar gradualmente a MapLibre Camera.
 */
export function createMapCameraController(cameraRef) {
  return {
    animateToRegion(region, duration = 400) {
      const viewState = regionToInitialViewState(region);
      if (!viewState || !cameraRef.current) return;
      cameraRef.current.setStop({
        center: viewState.center,
        zoom: viewState.zoom,
        bearing: 0,
        pitch: 0,
        duration,
      });
    },

    fitToCoordinates(coords = [], { edgePadding = {}, animated = true } = {}) {
      const boundsInfo = getBoundsForCoords(coords);
      if (!boundsInfo || !cameraRef.current) return;
      cameraRef.current.setStop({
        bounds: boundsInfo.bounds,
        padding: {
          top: edgePadding.top ?? 48,
          right: edgePadding.right ?? 48,
          bottom: edgePadding.bottom ?? 48,
          left: edgePadding.left ?? 48,
        },
        duration: animated ? 400 : 0,
      });
    },
  };
}
