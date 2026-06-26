const {
  resolveTripPickupCoords,
  resolveTripFinalDestCoords,
  resolveTripWaypoints,
  needsDriverDestinationChoice,
  shouldPreservePickupOriginOnAssign,
} = require('../../shared/trip-contract');

const PASSENGER_APP_NOTES = [
  '[APPROACH_ONLY]',
  '[PASSENGER_APP]',
  'Solicitado desde la app de pasajeros.',
  '[PICKUP_JSON:{"address":"Juana Hernandez 792, Salta","lat":-24.7981783,"lng":-65.3903467}]',
  '[FINAL_DEST_JSON:{"address":"Avenida Belgrano 300, Salta, Argentina","lat":-24.7876626,"lng":-65.4067392}]',
].join('\n');

describe('resolveTripPickupCoords', () => {
  it('viaje PASSENGER_APP: retiro desde origin/PICKUP_JSON, no destination', () => {
    const trip = {
      origin_address: 'Juana Hernandez 792, Salta',
      origin_lat: -24.7981783,
      origin_lng: -65.3903467,
      destination_address: 'Avenida Belgrano 300, Salta, Argentina',
      destination_lat: -24.7876626,
      destination_lng: -65.4067392,
      notes: PASSENGER_APP_NOTES,
    };

    const pickup = resolveTripPickupCoords(trip);
    expect(pickup.address).toBe('Juana Hernandez 792, Salta');
    expect(pickup.lat).toBeCloseTo(-24.7981783, 5);
    expect(pickup.lng).toBeCloseTo(-65.3903467, 5);
  });

  it('sin notes (query parcial): infiere app por origin legible + destino', () => {
    const trip = {
      origin_address: 'Juana Hernandez 792, Salta',
      origin_lat: -24.7981783,
      origin_lng: -65.3903467,
      destination_address: 'Avenida Belgrano 300, Salta, Argentina',
      destination_lat: -24.7876626,
      destination_lng: -65.4067392,
    };

    const pickup = resolveTripPickupCoords(trip);
    expect(pickup.address).toBe('Juana Hernandez 792, Salta');
  });

  it('viaje WhatsApp: retiro en origin_* (nuevo esquema) o destination_* (legacy)', () => {
    const newTrip = {
      origin_address: 'Belgrano 200, Salta',
      origin_lat: -24.7921,
      origin_lng: -65.4115,
      destination_address: null,
      destination_lat: null,
      destination_lng: null,
      notes: '[APPROACH_ONLY] Creado desde WhatsApp',
    };

    const pickupNew = resolveTripPickupCoords(newTrip);
    expect(pickupNew.address).toBe('Belgrano 200, Salta');

    const legacyTrip = {
      origin_address: '-24.79000, -65.41000',
      origin_lat: -24.79,
      origin_lng: -65.41,
      destination_address: 'Belgrano 200, Salta',
      destination_lat: -24.7921,
      destination_lng: -65.4115,
      notes: '[APPROACH_ONLY] Creado desde WhatsApp',
    };

    const pickupLegacy = resolveTripPickupCoords(legacyTrip);
    expect(pickupLegacy.address).toBe('Belgrano 200, Salta');
    expect(pickupLegacy.lat).toBeCloseTo(-24.7921, 5);
  });

  it('WhatsApp APPROACH_ONLY tras pasajero a bordo: retiro sigue en origin_*', () => {
    const trip = {
      origin_address: 'Bartolomé Mitre 300, A4400 Salta, Argentina',
      origin_lat: -24.7864131,
      origin_lng: -65.4107548,
      destination_address: null,
      destination_lat: null,
      destination_lng: null,
      notes: '[APPROACH_ONLY]\nEn cola de espera. Retiro confirmado.',
    };

    const pickup = resolveTripPickupCoords(trip);
    expect(pickup.address).toBe('Bartolomé Mitre 300, A4400 Salta, Argentina');
    expect(pickup.lat).toBeCloseTo(-24.7864131, 5);
  });

  it('WhatsApp con PICKUP_JSON no se trata como passenger-app', () => {
    const trip = {
      origin_address: '-24.80203, -65.39437',
      origin_lat: -24.80203,
      origin_lng: -65.39437,
      destination_address: 'Bartolomé Mitre 300, A4400 Salta, Argentina',
      destination_lat: -24.7864131,
      destination_lng: -65.4107548,
      notes: [
        '[APPROACH_ONLY]',
        '[PICKUP_JSON:{"address":"Bartolomé Mitre 300, A4400 Salta, Argentina","lat":-24.7864131,"lng":-65.4107548}]',
      ].join('\n'),
    };

    const pickup = resolveTripPickupCoords(trip);
    expect(pickup.address).toBe('Bartolomé Mitre 300, A4400 Salta, Argentina');
    expect(pickup.lat).toBeCloseTo(-24.7864131, 5);

    expect(resolveTripFinalDestCoords(trip)).toBeNull();
    expect(needsDriverDestinationChoice(trip)).toBe(true);
    expect(shouldPreservePickupOriginOnAssign(trip)).toBe(true);
  });

  it('passenger-app con destino acordado: no pide elegir destino al chofer', () => {
    const trip = {
      origin_address: 'Juana Hernandez 792, Salta',
      origin_lat: -24.7981783,
      origin_lng: -65.3903467,
      destination_address: 'Avenida Belgrano 300, Salta, Argentina',
      destination_lat: -24.7876626,
      destination_lng: -65.4067392,
      notes: PASSENGER_APP_NOTES,
    };

    expect(needsDriverDestinationChoice(trip)).toBe(false);
    expect(resolveTripFinalDestCoords(trip)?.address).toBe('Avenida Belgrano 300, Salta, Argentina');
  });

  it('WhatsApp con FINAL_DEST_JSON: destino precargado, sin selector manual', () => {
    const trip = {
      origin_address: 'Belgrano 200, Salta',
      origin_lat: -24.7921,
      origin_lng: -65.4115,
      destination_address: null,
      destination_lat: null,
      destination_lng: null,
      notes: [
        '[APPROACH_ONLY]',
        '[FINAL_DEST_JSON:{"address":"San Martín 500, Salta","lat":-24.79,"lng":-65.42}]',
      ].join('\n'),
    };

    expect(needsDriverDestinationChoice(trip)).toBe(false);
    expect(resolveTripFinalDestCoords(trip)?.address).toBe('San Martín 500, Salta');
  });

  it('passenger-app multi-stop: extrae WAYPOINTS_JSON desde notes', () => {
    const notes = [
      '[APPROACH_ONLY]',
      '[PASSENGER_APP]',
      '[WAYPOINTS_JSON:[{"address":"Bartolomé Mitre 200-298, Salta, Argentina","lat":-24.7874909,"lng":-65.41072919999999}]]',
    ].join('\n');

    const waypoints = resolveTripWaypoints({ notes, waypoints: null });
    expect(waypoints).toHaveLength(1);
    expect(waypoints[0].address).toContain('Mitre 200');
  });
});
