import { missingApplicantDocs, vehicleRequirementError } from '../../src/lib/driverApplicants';

describe('alta de chofer', () => {
  it('pide los ocho documentos y acepta un auto de 15 años', () => {
    expect(missingApplicantDocs(['dni', 'license'])).toHaveLength(6);
    expect(vehicleRequirementError({
      kind: 'car',
      year: 2011,
    }, new Date('2026-11-14'))).toBeNull();
  });

  it('rechaza una moto vieja o de menos de 110 cc', () => {
    const now = new Date('2026-11-14');
    expect(vehicleRequirementError({ kind: 'moto', year: 2010, cc: 150 }, now))
      .toMatch(/10 años/);
    expect(vehicleRequirementError({ kind: 'moto', year: 2020, cc: 100 }, now))
      .toMatch(/110 cc/);
  });

  it('rechaza un auto de más de 15 años', () => {
    expect(vehicleRequirementError({
      kind: 'car',
      year: 2010,
    }, new Date('2026-11-14'))).toMatch(/15 años/);
  });
});
