import {
  isDashboardOperatorUser,
  isDriverAuthEmail,
  isSuperAdminEmail,
} from '../../src/lib/adminSuperUser';

describe('adminSuperUser', () => {
  it('reconoce el super admin por email', () => {
    expect(isSuperAdminEmail('carlos.facundo.rr@gmail.com')).toBe(true);
    expect(isSuperAdminEmail('CARLOS.FACUNDO.RR@GMAIL.COM')).toBe(true);
    expect(isSuperAdminEmail('otro@gmail.com')).toBe(false);
  });

  it('detecta emails sintéticos de choferes', () => {
    expect(isDriverAuthEmail('4694725@profesional.test')).toBe(true);
    expect(isDriverAuthEmail('owner.12@profesional.test')).toBe(true);
    expect(isDriverAuthEmail('assigned.5493878630173@profesional.test')).toBe(true);
    expect(isDriverAuthEmail('carlos.facundo.rr@gmail.com')).toBe(false);
  });

  it('deja entrar al super admin aunque no tenga role admin', () => {
    expect(isDashboardOperatorUser({ email: 'carlos.facundo.rr@gmail.com' })).toBe(true);
  });

  it('deja entrar a operadores con role admin', () => {
    expect(isDashboardOperatorUser({
      email: 'mesa@profesional.app',
      user_metadata: { role: 'admin' },
    })).toBe(true);
    expect(isDashboardOperatorUser({
      email: 'mesa@profesional.app',
      app_metadata: { role: 'admin' },
    })).toBe(true);
  });

  it('bloquea choferes aunque se les ponga role admin', () => {
    expect(isDashboardOperatorUser({
      email: '4694725@profesional.test',
      user_metadata: { role: 'admin' },
    })).toBe(false);
  });

  it('bloquea cuentas sin rol de operador', () => {
    expect(isDashboardOperatorUser({ email: 'chofer@gmail.com' })).toBe(false);
    expect(isDashboardOperatorUser(null)).toBe(false);
  });
});
