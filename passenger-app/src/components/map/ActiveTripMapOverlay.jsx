import React from 'react';
import { View, StyleSheet } from 'react-native';
import MapLibreGL from '../../lib/maplibre';
import DriverMarker from './DriverMarker';
import PickupMarker from './PickupMarker';
import DestinationMarker from './DestinationMarker';
import { MapRouteLayers } from './MapRouteLayers';
import { normalizeCoordinate } from '../../utils/mapCoords';

export default function ActiveTripMapOverlay({
  pickupCoord,
  destinationCoord,
  smoothDriverCoord,
  markerHeading = 0,
  remainingPath = [],
  fullTripRoute = [],
  isSearching = false,
  isEnRouteToPickup = false,
  isEnRouteToDestination = false,
  isFinished = false,
  showDriver = false,
  driverNearTarget = false,
}) {
  if (!pickupCoord && !destinationCoord && !smoothDriverCoord) return null;

  const destinationCoordNorm = normalizeCoordinate(destinationCoord);

  return (
    <>
      {pickupCoord && !isEnRouteToDestination ? (
        <PickupMarker
          coordinate={pickupCoord}
          pulse={driverNearTarget && isEnRouteToPickup}
        />
      ) : null}

      {destinationCoordNorm && (isEnRouteToDestination || isSearching || isEnRouteToPickup) ? (
        isSearching || isEnRouteToPickup ? (
          <DestinationMarker coordinate={destinationCoordNorm} />
        ) : (
          <MapLibreGL.MarkerView
            id={`destination-${destinationCoordNorm.latitude.toFixed(5)}-${destinationCoordNorm.longitude.toFixed(5)}`}
            coordinate={[destinationCoordNorm.longitude, destinationCoordNorm.latitude]}
          >
            <View style={styles.destPin}>
              <View style={styles.destPinInner} />
            </View>
          </MapLibreGL.MarkerView>
        )
      ) : null}

      {smoothDriverCoord && showDriver ? (
        <DriverMarker coordinate={smoothDriverCoord} heading={markerHeading} />
      ) : null}

      {fullTripRoute?.length > 1 ? (
        <MapRouteLayers
          coords={fullTripRoute}
          idPrefix="full-trip-route"
          variant={isSearching ? 'preview' : undefined}
          lineColor={isSearching ? undefined : '#94A3B8'}
          casingColor={isSearching ? undefined : '#E2E8F0'}
          casingWidth={isSearching ? undefined : 6}
          lineWidth={isSearching ? undefined : 3}
        />
      ) : null}

      {!isSearching && !isFinished && remainingPath?.length > 1 ? (
        <MapRouteLayers
          coords={remainingPath}
          idPrefix="remaining-trip-route"
          variant="active"
          navigationMode
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  destPin: {
    width: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  destPinMuted: {
    opacity: 0.72,
  },
  destPinInner: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: '#0F172A',
  },
});
