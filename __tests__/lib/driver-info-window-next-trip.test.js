const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

jest.mock('../../src/context/ToastContext', () => ({
  useToast: () => ({ success: () => {}, error: () => {} }),
}));
jest.mock('../../src/components/TripNotesEditor', () => ({
  __esModule: true,
  default: () => null,
}));

const DriverInfoWindow = require('../../src/components/DriverInfoWindow').default;

const baseDriver = {
  id: 'd1',
  fullName: 'Juan Pérez',
  driverNumber: 3,
  isOnline: true,
  isAvailable: true,
  lat: -24.78,
  lng: -65.41,
  updatedAt: new Date().toISOString(),
  speed: 0,
  totalTrips: 10,
  vehicleBrand: 'Toyota',
  vehicleModel: 'Etios',
  activeTrip: { id: 'live-1', status: 'in_progress', destination_address: 'Belgrano 100', notes: '' },
};

function render(driver) {
  return renderToStaticMarkup(React.createElement(DriverInfoWindow, { driver, onClose: () => {} }));
}

describe('ventana del chofer: siguiente viaje', () => {
  it('muestra el botón para cancelar un siguiente viaje ya aceptado', () => {
    const html = render({
      ...baseDriver,
      reservedNextTrip: {
        id: 'next-1',
        status: 'accepted',
        passenger_name: 'Ana',
        destination_address: 'Mitre 200',
        next_after_trip_id: 'live-1',
      },
    });
    expect(html).toContain('Siguiente viaje');
    expect(html).toContain('Devolver a la cola');
  });

  it('lo muestra también mientras el siguiente está en confirmación', () => {
    const html = render({
      ...baseDriver,
      reservedNextTrip: {
        id: 'next-2',
        status: 'pending',
        passenger_name: 'Ana',
        destination_address: 'Mitre 200',
        next_after_trip_id: 'live-1',
      },
    });
    expect(html).toContain('Siguiente en confirmación');
    expect(html).toContain('Devolver a la cola');
  });

  it('sin siguiente viaje no aparece el botón', () => {
    const html = render({ ...baseDriver, reservedNextTrip: null });
    expect(html).not.toContain('Devolver a la cola');
  });
});
