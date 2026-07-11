import {
  buildAssignedDriverAuthEmail,
  buildOwnerAuthEmail,
  normalizeDriverPhone,
} from '../../src/lib/driverRoles';

jest.mock('../../src/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: jest.fn(),
}));

import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin';
import { adminUpdateDriverLoginPhone } from '../../src/lib/driverPhoneProvision';

describe('adminUpdateDriverLoginPhone', () => {
  const mockUpdateUserById = jest.fn();
  const mockListUsers = jest.fn();

  function mockDriverFetch(driver) {
    return {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({ data: driver, error: null }),
        }),
      }),
    };
  }

  /** Phone conflict: .select().neq().eq() → resolve (sin limit) */
  function mockPhoneConflictQuery(rows = []) {
    return {
      select: jest.fn().mockReturnValue({
        neq: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: rows, error: null }),
        }),
      }),
    };
  }

  /** Email conflict: .select().neq().eq().limit() */
  function mockEmailConflictQuery(rows = []) {
    return {
      select: jest.fn().mockReturnValue({
        neq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue({ data: rows, error: null }),
          }),
        }),
      }),
    };
  }

  function mockUpdate(updatedRow) {
    return {
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: updatedRow, error: null }),
          }),
        }),
      }),
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockListUsers.mockResolvedValue({ data: { users: [] }, error: null });
    mockUpdateUserById.mockResolvedValue({ data: { user: {} }, error: null });
  });

  it('actualiza phone_normalized y auth_email de un asignado y cambia el email en Auth', async () => {
    const oldPhone = normalizeDriverPhone('3874866003');
    const newPhone = normalizeDriverPhone('3875105250');
    const driver = {
      id: 'drv-1',
      user_id: 'auth-1',
      full_name: 'Luis Asignado',
      phone: '+5493874866003',
      phone_normalized: oldPhone,
      auth_email: buildAssignedDriverAuthEmail(oldPhone),
      is_assigned_driver: true,
      owner_id: 'owner-1',
      driver_number: 5,
    };

    const updatedRow = {
      ...driver,
      phone: '3875105250',
      phone_normalized: newPhone,
      auth_email: buildAssignedDriverAuthEmail(newPhone),
    };

    let fromCall = 0;
    getSupabaseAdmin.mockReturnValue({
      from: jest.fn(() => {
        fromCall += 1;
        if (fromCall === 1) return mockDriverFetch(driver);
        if (fromCall === 2) return mockPhoneConflictQuery([]);
        if (fromCall === 3) return mockEmailConflictQuery([]);
        return mockUpdate(updatedRow);
      }),
      auth: {
        admin: {
          updateUserById: mockUpdateUserById,
          listUsers: mockListUsers,
        },
      },
    });

    const result = await adminUpdateDriverLoginPhone({
      driverId: 'drv-1',
      phone: '3875105250',
    });

    expect(result.ok).toBe(true);
    expect(result.phone_normalized).toBe(newPhone);
    expect(result.auth_email).toBe(buildAssignedDriverAuthEmail(newPhone));
    expect(result.auth_email_changed).toBe(true);
    expect(mockUpdateUserById).toHaveBeenCalledWith('auth-1', expect.objectContaining({
      email: buildAssignedDriverAuthEmail(newPhone),
      email_confirm: true,
    }));
  });

  it('en owner con número de móvil mantiene auth_email por driver_number pero actualiza el teléfono', async () => {
    const oldPhone = normalizeDriverPhone('3874866003');
    const newPhone = normalizeDriverPhone('3875105250');
    const authEmail = buildOwnerAuthEmail(oldPhone, 49);
    const driver = {
      id: 'own-1',
      user_id: 'auth-2',
      full_name: 'DIAZ MARCIO',
      phone: '+5493874866003',
      phone_normalized: oldPhone,
      auth_email: authEmail,
      is_assigned_driver: false,
      owner_id: null,
      driver_number: 49,
    };

    const updatedRow = {
      ...driver,
      phone: '3875105250',
      phone_normalized: newPhone,
      auth_email: buildOwnerAuthEmail(newPhone, 49),
    };

    let fromCall = 0;
    getSupabaseAdmin.mockReturnValue({
      from: jest.fn(() => {
        fromCall += 1;
        if (fromCall === 1) return mockDriverFetch(driver);
        if (fromCall === 2) return mockPhoneConflictQuery([]);
        if (fromCall === 3) return mockEmailConflictQuery([]);
        return mockUpdate(updatedRow);
      }),
      auth: {
        admin: {
          updateUserById: mockUpdateUserById,
          listUsers: mockListUsers,
        },
      },
    });

    const result = await adminUpdateDriverLoginPhone({
      driverId: 'own-1',
      phone: '3875105250',
    });

    expect(result.ok).toBe(true);
    expect(result.phone_normalized).toBe(newPhone);
    expect(result.auth_email).toBe(buildOwnerAuthEmail(newPhone, 49));
    expect(result.auth_email_changed).toBe(false);
    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });

  it('rechaza si el teléfono ya está usado por otro chofer asignado', async () => {
    const driver = {
      id: 'drv-1',
      user_id: null,
      full_name: 'A',
      phone: '3871111111',
      phone_normalized: normalizeDriverPhone('3871111111'),
      auth_email: null,
      is_assigned_driver: true,
      owner_id: 'owner-1',
      driver_number: 1,
    };

    let fromCall = 0;
    getSupabaseAdmin.mockReturnValue({
      from: jest.fn(() => {
        fromCall += 1;
        if (fromCall === 1) return mockDriverFetch(driver);
        return mockPhoneConflictQuery([{
          id: 'other',
          full_name: 'Otro',
          is_assigned_driver: true,
          owner_id: 'owner-2',
          driver_number: 2,
        }]);
      }),
      auth: { admin: { updateUserById: mockUpdateUserById, listUsers: mockListUsers } },
    });

    const result = await adminUpdateDriverLoginPhone({
      driverId: 'drv-1',
      phone: '3872222222',
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
    expect(result.message).toMatch(/ya está en uso/i);
  });

  it('permite que un titular comparta teléfono con otro titular (socios)', async () => {
    const oldPhone = normalizeDriverPhone('3874866003');
    const sharedPhone = normalizeDriverPhone('3875638266');
    const driver = {
      id: 'own-1',
      user_id: 'auth-2',
      full_name: 'DIAZ MARCIO',
      phone: '+5493874866003',
      phone_normalized: oldPhone,
      auth_email: buildOwnerAuthEmail(oldPhone, 49),
      is_assigned_driver: false,
      owner_id: null,
      driver_number: 49,
    };
    const updatedRow = {
      ...driver,
      phone: '3875638266',
      phone_normalized: sharedPhone,
      auth_email: buildOwnerAuthEmail(sharedPhone, 49),
    };

    let fromCall = 0;
    getSupabaseAdmin.mockReturnValue({
      from: jest.fn(() => {
        fromCall += 1;
        if (fromCall === 1) return mockDriverFetch(driver);
        if (fromCall === 2) {
          return mockPhoneConflictQuery([{
            id: 'own-2',
            full_name: 'CRUZ CRISTIAN ALFREDO',
            is_assigned_driver: false,
            owner_id: null,
            driver_number: 12,
          }]);
        }
        if (fromCall === 3) return mockEmailConflictQuery([]);
        return mockUpdate(updatedRow);
      }),
      auth: {
        admin: {
          updateUserById: mockUpdateUserById,
          listUsers: mockListUsers,
        },
      },
    });

    const result = await adminUpdateDriverLoginPhone({
      driverId: 'own-1',
      phone: '3875638266',
    });

    expect(result.ok).toBe(true);
    expect(result.partnered).toBe(true);
    expect(result.partners).toEqual([
      expect.objectContaining({ id: 'own-2', full_name: 'CRUZ CRISTIAN ALFREDO' }),
    ]);
    expect(result.phone_normalized).toBe(sharedPhone);
  });
});
