/**
 * Capa de mapa para passenger-app: Google Maps SDK nativo vía react-native-maps.
 * Mantiene la API usada por los componentes (MapView, Camera, MarkerView, ShapeSource…).
 */
import React, {
  Children,
  createContext,
  forwardRef,
  isValidElement,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import RNMapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

const MapContext = createContext(null);

function lngLatToCoord(input) {
  if (Array.isArray(input) && input.length >= 2) {
    return { latitude: Number(input[1]), longitude: Number(input[0]) };
  }
  if (input?.latitude != null && input?.longitude != null) {
    return { latitude: Number(input.latitude), longitude: Number(input.longitude) };
  }
  return null;
}

function zoomToLatitudeDelta(zoom) {
  const z = Number(zoom);
  if (!Number.isFinite(z)) return 0.02;
  return 360 / Math.pow(2, z);
}

function buildCameraApi(getMapRef) {
  return {
    setCamera(options = {}) {
      const map = getMapRef();
      if (!map) return false;

      const center = options.centerCoordinate ?? options.center;
      const zoom = options.zoomLevel ?? options.zoom;
      const duration = options.animationDuration ?? options.duration ?? 0;

      if (!Array.isArray(center) || center.length < 2) return false;

      const latitudeDelta = zoomToLatitudeDelta(zoom ?? 13);
      const region = {
        latitude: Number(center[1]),
        longitude: Number(center[0]),
        latitudeDelta,
        longitudeDelta: latitudeDelta,
      };

      if (!Number.isFinite(region.latitude) || !Number.isFinite(region.longitude)) return false;

      map.animateToRegion(region, duration);
      return true;
    },

    animateToRegion(region, duration = 400) {
      const map = getMapRef();
      if (!map || !region) return;
      const latitude = Number(region.latitude);
      const longitude = Number(region.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

      map.animateToRegion(
        {
          latitude,
          longitude,
          latitudeDelta: Number(region.latitudeDelta) || 0.02,
          longitudeDelta: Number(region.longitudeDelta) || 0.02,
        },
        duration,
      );
    },

    fitBounds(ne, sw, paddingInput, duration = 0) {
      const map = getMapRef();
      if (!map || !Array.isArray(ne) || !Array.isArray(sw)) return;

      const coordinates = [
        { latitude: Number(ne[1]), longitude: Number(ne[0]) },
        { latitude: Number(sw[1]), longitude: Number(sw[0]) },
      ];

      let edgePadding;
      if (typeof paddingInput === 'number') {
        edgePadding = {
          top: paddingInput,
          right: paddingInput,
          bottom: paddingInput,
          left: paddingInput,
        };
      } else if (Array.isArray(paddingInput)) {
        edgePadding = {
          top: paddingInput[0] ?? 0,
          right: paddingInput[1] ?? 0,
          bottom: paddingInput[2] ?? 0,
          left: paddingInput[3] ?? 0,
        };
      } else {
        edgePadding = paddingInput;
      }

      map.fitToCoordinates(coordinates, {
        edgePadding,
        animated: duration > 0,
      });
    },
  };
}

const MapView = forwardRef(function MapView(props, ref) {
  const innerRef = useRef(null);
  const cameraApiRef = useRef(null);
  const [showUserLocation, setShowUserLocation] = useState(false);

  const {
    mapStyle,
    compassEnabled,
    logoEnabled: _logoEnabled,
    attributionEnabled: _attributionEnabled,
    rotateEnabled = false,
    pitchEnabled = false,
    zoomEnabled = true,
    scrollEnabled = true,
    onTouchStart,
    onDidFinishLoadingMap,
    onRegionIsChanging,
    onRegionDidChange,
    pointerEvents,
    mapPadding: mapPaddingRaw,
    children,
    style,
    ...rest
  } = props;

  // Sanitize mapPadding: react-native-maps crashes on Android (NullPointerException in
  // applyBaseMapPadding) if any value is null/undefined/NaN. Only pass it when all
  // four sides are valid finite numbers.
  const mapPadding = mapPaddingRaw &&
    Number.isFinite(mapPaddingRaw.top) &&
    Number.isFinite(mapPaddingRaw.right) &&
    Number.isFinite(mapPaddingRaw.bottom) &&
    Number.isFinite(mapPaddingRaw.left)
    ? mapPaddingRaw
    : undefined;

  const getMapRef = () => innerRef.current;

  const mapContext = useMemo(
    () => ({
      getMapRef,
      registerCamera(api) {
        cameraApiRef.current = api;
      },
      unregisterCamera() {
        cameraApiRef.current = null;
      },
      setUserLocationVisible(visible) {
        setShowUserLocation(visible);
      },
    }),
    [],
  );

  const cameraBridge = useMemo(() => buildCameraApi(getMapRef), []);

  useImperativeHandle(
    ref,
    () => ({
      get inner() {
        return innerRef.current;
      },
      setCamera: (...args) => cameraApiRef.current?.setCamera?.(...args)
        ?? cameraBridge.setCamera(...args),
      fitBounds: (...args) => cameraApiRef.current?.fitBounds?.(...args)
        ?? cameraBridge.fitBounds(...args),
      animateToRegion: (...args) => cameraApiRef.current?.animateToRegion?.(...args)
        ?? cameraBridge.animateToRegion(...args),
    }),
    [cameraBridge],
  );

  const handleRegionChangeComplete = (region) => {
    onRegionDidChange?.({
      geometry: { coordinates: [region.longitude, region.latitude] },
      properties: { center: [region.longitude, region.latitude] },
      nativeEvent: {
        centerCoordinate: [region.longitude, region.latitude],
        region,
      },
    });
  };

  return (
    <MapContext.Provider value={mapContext}>
      <RNMapView
        ref={innerRef}
        provider={PROVIDER_GOOGLE}
        style={style}
        customMapStyle={mapStyle}
        mapPadding={mapPadding}
        showsCompass={compassEnabled ?? false}
        rotateEnabled={rotateEnabled}
        pitchEnabled={pitchEnabled}
        zoomEnabled={zoomEnabled}
        scrollEnabled={scrollEnabled}
        showsUserLocation={showUserLocation}
        showsMyLocationButton={false}
        onMapReady={onDidFinishLoadingMap}
        onRegionChangeStart={onRegionIsChanging}
        onRegionChange={onRegionIsChanging}
        onRegionChangeComplete={handleRegionChangeComplete}
        onPanDrag={onTouchStart}
        pointerEvents={pointerEvents}
        {...rest}
      >
        {children}
      </RNMapView>
    </MapContext.Provider>
  );
});

const CameraCompat = forwardRef(function CameraCompat(props, ref) {
  const mapCtx = useContext(MapContext);
  const { defaultSettings, initialViewState, ...rest } = props;
  const appliedInitialRef = useRef(false);

  const resolvedInitialViewState = initialViewState ?? (
    defaultSettings
      ? {
          center: defaultSettings.center ?? defaultSettings.centerCoordinate,
          zoom: defaultSettings.zoom ?? defaultSettings.zoomLevel,
        }
      : undefined
  );

  const api = useMemo(() => buildCameraApi(() => mapCtx?.getMapRef?.()), [mapCtx]);

  useImperativeHandle(ref, () => api, [api]);

  useEffect(() => {
    mapCtx?.registerCamera?.(api);
    return () => mapCtx?.unregisterCamera?.();
  }, [api, mapCtx]);

  useEffect(() => {
    if (appliedInitialRef.current || !resolvedInitialViewState) return;

    const center = resolvedInitialViewState.center ?? resolvedInitialViewState.centerCoordinate;
    const zoom = resolvedInitialViewState.zoom ?? resolvedInitialViewState.zoomLevel;
    if (!center) return;

    let cancelled = false;
    const applyInitialCamera = () => {
      if (cancelled || appliedInitialRef.current) return;
      if (!mapCtx?.getMapRef?.()) {
        requestAnimationFrame(applyInitialCamera);
        return;
      }
      appliedInitialRef.current = true;
      api.setCamera({
        centerCoordinate: Array.isArray(center) ? center : [center.longitude, center.latitude],
        zoomLevel: zoom ?? 13,
        animationDuration: 0,
      });
    };

    applyInitialCamera();
    return () => {
      cancelled = true;
    };
  }, [api, mapCtx, resolvedInitialViewState]);

  return null;
});

const MarkerView = forwardRef(function MarkerView(
  { coordinate, lngLat, children, anchor, tracksViewChanges, ...props },
  ref,
) {
  const coord = lngLatToCoord(lngLat ?? coordinate);
  if (!coord || !Number.isFinite(coord.latitude) || !Number.isFinite(coord.longitude)) {
    return null;
  }

  return (
    <Marker
      ref={ref}
      coordinate={coord}
      anchor={anchor ?? { x: 0.5, y: 0.5 }}
      tracksViewChanges={tracksViewChanges ?? false}
      {...props}
    >
      {children}
    </Marker>
  );
});

function LineLayer() {
  return null;
}
LineLayer.displayName = 'MapLineLayer';

const ShapeSource = forwardRef(function ShapeSource({ shape, data, children }, ref) {
  const geo = data ?? shape;
  const coordinates = useMemo(() => {
    const raw = geo?.geometry?.coordinates;
    if (!Array.isArray(raw) || raw.length < 2) return [];
    return raw.map(([lng, lat]) => ({
      latitude: Number(lat),
      longitude: Number(lng),
    })).filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
  }, [geo]);

  const layers = useMemo(() => {
    const collected = [];
    Children.forEach(children, (child) => {
      if (!isValidElement(child)) return;
      if (child.type !== LineLayer && child.type?.displayName !== 'MapLineLayer') return;
      collected.push(child.props);
    });
    return collected;
  }, [children]);

  if (coordinates.length < 2 || layers.length === 0) return null;

  return layers.map((layerProps, index) => {
    const style = layerProps.style ?? {};
    return (
      <Polyline
        key={layerProps.id ?? `line-${index}`}
        ref={index === 0 ? ref : undefined}
        coordinates={coordinates}
        strokeColor={style.lineColor ?? '#2563EB'}
        strokeWidth={style.lineWidth ?? 4}
        lineCap={style.lineCap === 'round' ? 'round' : 'butt'}
        lineJoin={style.lineJoin === 'round' ? 'round' : 'miter'}
        zIndex={index}
      />
    );
  });
});

function UserLocationCompat({ visible = true }) {
  const mapCtx = useContext(MapContext);

  useEffect(() => {
    mapCtx?.setUserLocationVisible?.(visible);
    return () => mapCtx?.setUserLocationVisible?.(false);
  }, [visible, mapCtx]);

  return null;
}

const MapLibreGL = {
  MapView,
  Camera: CameraCompat,
  UserLocation: UserLocationCompat,
  MarkerView,
  ShapeSource,
  LineLayer,
  PROVIDER_GOOGLE,
};

export default MapLibreGL;
