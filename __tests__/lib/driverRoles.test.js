import {
  normalizeDriverPhone,
  buildAssignedDriverAuthEmail,
  buildAssignedDriverInsertPayload,
  isAssignedDriver,
  isFleetRoot,
  getAssignedDriverRegistrationStatus,
  MAX_ASSIGNED_DRIVERS,
} from '../../src/lib/driverRoles';

describe('driverRoles (dashboard)', () => {
  it('normaliza teléfonos argentinos', () => {
    expect(normalizeDriverPhone('3878630173')).toBe('543878630173');
  });

  it('genera email sintético de chofer asignado', () => {
    expect(buildAssignedDriverAuthEmail('543878630173')).toBe(
      'assigned.543878630173@profesional.test',
    );
  });

  it('distingue chofer raíz de asignado', () => {
    expect(isFleetRoot({ role: 'driver' })).toBe(true);
    expect(isFleetRoot({ is_assigned_driver: true, owner_id: 'x' })).toBe(false);
    expect(isAssignedDriver({ owner_id: 'x' })).toBe(true);
  });

  it('calcula estado de registro', () => {
    expect(getAssignedDriverRegistrationStatus({ user_id: null })).toBe('pending');
    expect(getAssignedDriverRegistrationStatus({ user_id: 'u1', password_initialized: true })).toBe('registered');
  });

  it('máximo 3 choferes asignados', () => {
    expect(MAX_ASSIGNED_DRIVERS).toBe(3);
  });

  it('copia vehículo y número de móvil del dueño al crear asignado', () => {
    const owner = {
      id: 'owner-1',
      driver_number: 2,
      vehicle_brand: 'Volkswagen',
      vehicle_model: 'Gol',
      vehicle_plate: 'AB123CD',
      vehicle_type: 'auto',
    };
    const payload = buildAssignedDriverInsertPayload(owner, {
      fullName: 'Charly Brown',
      phone: '3878630173',
      phoneNormalized: '543878630173',
      authEmail: 'assigned.543878630173@profesional.test',
    });

    expect(payload.driver_number).toBe(2);
    expect(payload.vehicle_plate).toBe('AB123CD');
    expect(payload.owner_id).toBe('owner-1');
    expect(payload.phone).toBe('3878630173');
  });
});
