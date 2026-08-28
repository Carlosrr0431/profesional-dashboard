export const OPEN_TRIP_STATUSES = [
  'queued',
  'pending',
  'accepted',
  'going_to_pickup',
  'in_progress',
];

export const PASSENGER_STATUS = {
  queued: {
    label: 'Buscando conductor',
    desc: 'Asignando el chofer más cercano',
    canCancel: true,
  },
  pending: {
    label: 'Confirmando viaje',
    desc: 'Un conductor está revisando tu solicitud',
    canCancel: true,
  },
  accepted: {
    label: 'Conductor asignado',
    desc: 'En breve sale hacia tu ubicación',
    canCancel: false,
  },
  going_to_pickup: {
    label: 'Conductor en camino',
    desc: 'Se dirige al punto de origen',
    canCancel: true,
  },
  in_progress: {
    label: 'Viaje en curso',
    desc: 'Disfrutá el trayecto',
    canCancel: false,
  },
  completed: {
    label: 'Viaje completado',
    desc: 'Gracias por viajar con nosotros',
    canCancel: false,
  },
  cancelled: {
    label: 'Viaje cancelado',
    desc: 'La solicitud fue cancelada',
    canCancel: false,
  },
  scheduled: {
    label: 'Programado',
    desc: 'El viaje se despachará a la hora indicada',
    canCancel: true,
  },
};

export const DRIVER_STATUS = {
  pending: { label: 'Nuevo viaje', action: 'Aceptar' },
  accepted: { label: 'Aceptado', action: 'Ir al retiro' },
  going_to_pickup: { label: 'En camino al pasajero', action: 'Pasajero a bordo' },
  in_progress: { label: 'Viaje en curso', action: 'Finalizar viaje' },
  completed: { label: 'Completado', action: null },
  cancelled: { label: 'Cancelado', action: null },
  queued: { label: 'En cola', action: null },
};

export function isOpenTripStatus(status) {
  return OPEN_TRIP_STATUSES.includes(String(status || '').toLowerCase());
}

/** Viaje con chofer asignado: hay que dibujar ruta viva hasta retiro o destino. */
export function isLiveNavTrip(status) {
  const key = String(status || '').toLowerCase();
  return key === 'accepted' || key === 'going_to_pickup' || key === 'in_progress';
}

export function passengerStatusMeta(status) {
  const key = String(status || '').toLowerCase();
  return PASSENGER_STATUS[key] || {
    label: key || 'Viaje',
    desc: '',
    canCancel: false,
  };
}
