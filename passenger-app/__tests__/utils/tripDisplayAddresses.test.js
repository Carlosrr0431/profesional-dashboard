const {
  getTripPickupDisplayAddress,
  getTripDestinationDisplayAddress,
} = require('../../src/utils/tripDisplayAddresses');

const PASSENGER_TRIP = {
  origin_address: 'Doctor Mariano Boedo 547, Salta',
  origin_lat: '-24.79520000',
  origin_lng: '-65.39533830',
  destination_address: 'Bartolomé Mitre 200-298, A4400 Salta, Argentina',
  destination_lat: '-24.78749090',
  destination_lng: '-65.41072920',
  notes: `[APPROACH_ONLY]
[PASSENGER_APP]
[PICKUP_JSON:{"address":"Doctor Mariano Boedo 547, Salta","lat":-24.7952,"lng":-65.3953383}]
[FINAL_DEST_JSON:{"address":"Bartolomé Mitre 200-298, A4400 Salta, Argentina","lat":-24.7874909,"lng":-65.4107292}]`,
};

describe('tripDisplayAddresses', () => {
  it('muestra recogida y destino distintos en viajes de la app de pasajeros', () => {
    const pickup = getTripPickupDisplayAddress(PASSENGER_TRIP);
    const dest = getTripDestinationDisplayAddress(PASSENGER_TRIP);

    expect(pickup).toContain('Boedo');
    expect(dest).toContain('Mitre');
    expect(pickup).not.toBe(dest);
  });

  it('usa PICKUP_JSON si origin_address falta', () => {
    const trip = {
      ...PASSENGER_TRIP,
      origin_address: null,
      notes: PASSENGER_TRIP.notes,
    };
    expect(getTripPickupDisplayAddress(trip)).toContain('Boedo');
  });
});
