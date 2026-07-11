import {
  findOwnerPartners,
  getDriverPhoneKey,
  getFleetListGroupKey,
  normalizeDriverPhone,
} from '../../src/lib/driverRoles';

describe('owner partners helpers', () => {
  const ownerA = {
    id: 'a',
    full_name: 'A',
    phone: '3871111111',
    phone_normalized: normalizeDriverPhone('3871111111'),
    is_assigned_driver: false,
    owner_id: null,
    driver_number: 1,
  };
  const ownerB = {
    id: 'b',
    full_name: 'B',
    phone: '3871111111',
    phone_normalized: normalizeDriverPhone('3871111111'),
    is_assigned_driver: false,
    owner_id: null,
    driver_number: 2,
  };
  const ownerC = {
    id: 'c',
    full_name: 'C',
    phone: '3872222222',
    phone_normalized: normalizeDriverPhone('3872222222'),
    is_assigned_driver: false,
    owner_id: null,
    driver_number: 3,
  };
  const assigned = {
    id: 'd',
    full_name: 'D',
    phone: '3873333333',
    phone_normalized: normalizeDriverPhone('3873333333'),
    is_assigned_driver: true,
    owner_id: 'a',
  };

  it('getDriverPhoneKey normaliza', () => {
    expect(getDriverPhoneKey(ownerA)).toBe(normalizeDriverPhone('3871111111'));
  });

  it('findOwnerPartners encuentra socios con mismo teléfono', () => {
    expect(findOwnerPartners([ownerA, ownerB, ownerC, assigned], ownerA)).toEqual([ownerB]);
  });

  it('getFleetListGroupKey agrupa socios y sus asignados', () => {
    const ownerById = { a: ownerA, b: ownerB, c: ownerC };
    expect(getFleetListGroupKey(ownerA, ownerById)).toBe(`phone:${getDriverPhoneKey(ownerA)}`);
    expect(getFleetListGroupKey(ownerB, ownerById)).toBe(`phone:${getDriverPhoneKey(ownerA)}`);
    expect(getFleetListGroupKey(assigned, ownerById)).toBe(`phone:${getDriverPhoneKey(ownerA)}`);
    expect(getFleetListGroupKey(ownerC, ownerById)).toBe(`phone:${getDriverPhoneKey(ownerC)}`);
  });
});
