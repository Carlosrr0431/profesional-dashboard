import {
  normalizeDriverPhone,
  buildAssignedDriverAuthEmail,
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
});
