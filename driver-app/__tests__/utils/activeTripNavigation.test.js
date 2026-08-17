import {
  ACTIVE_TRIP_BACK,
  resolveActiveTripBackAction,
} from '../../src/utils/activeTripNavigation';

describe('resolveActiveTripBackAction', () => {
  it('en búsqueda de destino vuelve al selector de modo', () => {
    expect(resolveActiveTripBackAction({
      hasActiveTrip: true,
      tripStatus: 'going_to_pickup',
      flowStep: 'set_destination',
      destinationSet: false,
    })).toBe(ACTIVE_TRIP_BACK.CHOOSE_DEST_MODE);
  });

  it('no abandona el viaje activo en el resto del flujo', () => {
    expect(resolveActiveTripBackAction({
      hasActiveTrip: true,
      tripStatus: 'going_to_pickup',
      flowStep: 'choose_dest_mode',
      destinationSet: false,
    })).toBe(ACTIVE_TRIP_BACK.STAY);

    expect(resolveActiveTripBackAction({
      hasActiveTrip: true,
      tripStatus: 'in_progress',
      flowStep: 'in_progress',
      destinationSet: true,
    })).toBe(ACTIVE_TRIP_BACK.STAY);
  });

  it('permite salir al completar, cancelar o ver el resumen', () => {
    expect(resolveActiveTripBackAction({
      hasActiveTrip: true,
      tripStatus: 'completed',
      flowStep: 'in_progress',
    })).toBe(ACTIVE_TRIP_BACK.LEAVE);

    expect(resolveActiveTripBackAction({
      hasActiveTrip: true,
      tripStatus: 'cancelled',
      flowStep: 'going_to_pickup',
    })).toBe(ACTIVE_TRIP_BACK.LEAVE);

    expect(resolveActiveTripBackAction({
      hasActiveTrip: false,
      showingSummary: true,
    })).toBe(ACTIVE_TRIP_BACK.LEAVE);
  });
});
