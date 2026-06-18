import React, { useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';

/**
 * Compatibilidad con notificaciones y enlaces antiguos: el viaje activo
 * vive en HomeMain con el bottom sheet integrado.
 */
export default function ActiveTripScreen() {
  const navigation = useNavigation();

  useEffect(() => {
    navigation.replace('HomeMain');
  }, [navigation]);

  return null;
}
