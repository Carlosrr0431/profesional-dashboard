import { buildFleetOwnersById, mergeAssignedDriverWithOwner } from '../../src/lib/fleetDriverEnrichment';

describe('fleetDriverEnrichment', () => {
  const owner = {
    id: 'owner-1',
    full_name: 'Juan Pérez',
    phone: '3878000000',
    driver_number: 2,
    vehicle_brand: 'Volkswagen',
    vehicle_model: 'Gol',
    vehicle_plate: 'AB123CD',
    is_assigned_driver: false,
    owner_id: null,
  };

  it('mergeAssignedDriverWithOwner completa datos faltantes', () => {
    const assigned = {
      id: 'a1',
      owner_id: 'owner-1',
      is_assigned_driver: true,
      full_name: 'Charly Brown',
      phone: '3878630173',
      vehicle_plate: null,
      driver_number: null,
    };

    const merged = mergeAssignedDriverWithOwner(assigned, owner);
    expect(merged.vehicle_plate).toBe('AB123CD');
    expect(merged.driver_number).toBe(2);
  });

  it('buildFleetOwnersById indexa solo dueños raíz', () => {
    const map = buildFleetOwnersById([owner, { id: 'a1', owner_id: 'owner-1', is_assigned_driver: true }]);
    expect(map['owner-1']).toEqual(owner);
    expect(map.a1).toBeUndefined();
  });

  it('el asignado hereda el número 1 del titular', () => {
    const titular = { ...owner, id: 'titular-1', owner_id: 'grupo', driver_number: 1 };
    const assigned = {
      id: 'a1',
      owner_id: 'titular-1',
      is_assigned_driver: true,
      driver_number: null,
    };
    const map = buildFleetOwnersById([titular, assigned]);
    expect(mergeAssignedDriverWithOwner(assigned, map['titular-1']).driver_number).toBe(1);
  });
});
