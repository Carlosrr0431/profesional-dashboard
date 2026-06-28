import React from 'react';
import { View, StyleSheet } from 'react-native';
import MapLibreGL from '../../lib/maplibre';
import { normalizeCoordinate } from '../../utils/mapCoords';

const PIN_COLOR = '#EA4335';   // Rojo Google Maps
const PIN_BORDER = '#C5221F';  // Borde más oscuro

/** Marcador de destino estilo pin Google Maps (teardrop). */
export default function DestinationMarker({ coordinate }) {
  const coord = normalizeCoordinate(coordinate);
  if (!coord) return null;

  return (
    <MapLibreGL.MarkerView
      id={`destination-${coord.latitude.toFixed(5)}-${coord.longitude.toFixed(5)}`}
      coordinate={[coord.longitude, coord.latitude]}
      anchor={{ x: 0.5, y: 1 }}
    >
      <View style={styles.wrap} collapsable={false}>
        {/* Cabeza circular del pin */}
        <View style={styles.pinHead}>
          {/* Círculo blanco interior (pupila) */}
          <View style={styles.pinInner} />
        </View>
        {/* Punta triangular del pin */}
        <View style={styles.pinTip} />
      </View>
    </MapLibreGL.MarkerView>
  );
}

const HEAD_SIZE = 30;
const INNER_SIZE = 10;
const TIP_W = 12;
const TIP_H = 14;

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    // sin paddingBottom para que el anchor (x:0.5, y:1) apunte justo a la punta
  },
  pinHead: {
    width: HEAD_SIZE,
    height: HEAD_SIZE,
    borderRadius: HEAD_SIZE / 2,
    backgroundColor: PIN_COLOR,
    borderWidth: 2,
    borderColor: PIN_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
  pinInner: {
    width: INNER_SIZE,
    height: INNER_SIZE,
    borderRadius: INNER_SIZE / 2,
    backgroundColor: '#FFFFFF',
  },
  pinTip: {
    width: 0,
    height: 0,
    borderLeftWidth: TIP_W / 2,
    borderRightWidth: TIP_W / 2,
    borderTopWidth: TIP_H,
    borderStyle: 'solid',
    backgroundColor: 'transparent',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: PIN_COLOR,
    marginTop: -2, // superpone levemente con la cabeza para que no haya hueco
  },
});
