import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Marker } from '@maplibre/maplibre-react-native';
import DriverMarker from './DriverMarker';
import PickupMarker from './PickupMarker';
import { MapRouteLayers } from './MapRouteLayers';
import { ROUTE_LINE, ROUTE_CASING } from '../../constants/mapStyle';
import { toLngLat } from '../../utils/mapLibreHelpers';

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

  const destinationLngLat = toLngLat(destinationCoord);

  return (
    <>
      {pickupCoord && !isEnRouteToDestination ? (
        <PickupMarker
          coordinate={pickupCoord}
          pulse={driverNearTarget && isEnRouteToPickup}
        />
      ) : null}

      {destinationLngLat && (isEnRouteToDestination || isSearching || isEnRouteToPickup) ? (
        <Marker id="passenger-destination" lngLat={destinationLngLat}>
          <View style={[styles.destPin, (isSearching || isEnRouteToPickup) && styles.destPinMuted]}>
            <View style={styles.destPinInner} />
          </View>
        </Marker>
      ) : null}

      {smoothDriverCoord && showDriver ? (
        <DriverMarker coordinate={smoothDriverCoord} heading={markerHeading} />
      ) : null}

      {!isSearching && fullTripRoute?.length > 1 ? (
        <MapRouteLayers
          idPrefix="trip-full"
          coords={fullTripRoute}
          lineColor="#94A3B8"
          casingColor="#E2E8F0"
          casingWidth={6}
          lineWidth={3}
        />
      ) : null}

      {!isSearching && !isFinished && remainingPath?.length > 1 ? (
        <MapRouteLayers
          idPrefix="trip-remaining"
          coords={remainingPath}
          lineColor={ROUTE_LINE}
          casingColor={ROUTE_CASING}
          casingWidth={10}
          lineWidth={5}
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
