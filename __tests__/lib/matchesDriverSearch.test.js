import { matchesDriverSearch } from '../../src/lib/driverRoles';

describe('matchesDriverSearch', () => {
  const driver = {
    full_name: 'DIAZ MARCIO',
    phone: '+5493875638266',
    vehicle_plate: 'AC628PE',
    driver_number: 49,
  };

  it('encuentra por nombre', () => {
    expect(matchesDriverSearch(driver, 'marcio')).toBe(true);
  });

  it('encuentra por número de móvil exacto', () => {
    expect(matchesDriverSearch(driver, '49')).toBe(true);
    expect(matchesDriverSearch(driver, '#49')).toBe(true);
    expect(matchesDriverSearch(driver, 'móvil 49')).toBe(true);
  });

  it('no confunde parciales numéricos (2 no trae 49)', () => {
    expect(matchesDriverSearch(driver, '2')).toBe(false);
    expect(matchesDriverSearch({ ...driver, driver_number: 12 }, '2')).toBe(false);
    expect(matchesDriverSearch({ ...driver, driver_number: 12 }, '12')).toBe(true);
  });

  it('encuentra por teléfono con dígitos', () => {
    expect(matchesDriverSearch(driver, '3875638266')).toBe(true);
  });

  it('acepta camelCase del panel del mapa', () => {
    expect(matchesDriverSearch({
      fullName: 'Juan',
      driverNumber: 10,
      vehiclePlate: 'ABC123',
      phone: '3871111111',
    }, '10')).toBe(true);
  });
});
