import {
  buildAssignedDriverAuthEmail,
  normalizeDriverPhone,
} from '../../src/lib/driverRoles';

jest.mock('../../src/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: jest.fn(),
}));

import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin';
import { provisionAssignedDriverAuth } from '../../src/lib/assignedDriverProvision';

describe('provisionAssignedDriverAuth', () => {
  const mockUpdate = jest.fn();
  const mockEq = jest.fn();
  const mockSelect = jest.fn();
  const mockFrom = jest.fn();
  const mockCreateUser = jest.fn();
  const mockUpdateUserById = jest.fn();
  const mockListUsers = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    mockEq.mockReturnValue({ maybeSingle: jest.fn() });
    mockSelect.mockReturnValue({ eq: jest.fn().mockReturnValue({ maybeSingle: jest.fn() }) });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockFrom.mockImplementation(() => ({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn(),
        }),
      }),
      update: mockUpdate,
    }));

    getSupabaseAdmin.mockReturnValue({
      from: mockFrom,
      auth: {
        admin: {
          createUser: mockCreateUser,
          updateUserById: mockUpdateUserById,
          listUsers: mockListUsers,
        },
      },
    });
  });

  it('rechaza teléfono que no coincide con el chofer', async () => {
    const maybeSingle = jest.fn().mockResolvedValue({
      data: {
        id: 'd1',
        is_assigned_driver: true,
        owner_id: 'owner1',
        phone_normalized: '5493878630173',
        password_initialized: false,
        user_id: null,
        auth_email: buildAssignedDriverAuthEmail('5493878630173'),
        full_name: 'Juan',
      },
      error: null,
    });

    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({ maybeSingle }),
      }),
      update: mockUpdate,
    });

    const result = await provisionAssignedDriverAuth({
      driverId: 'd1',
      phone: '3878000000',
      password: 'password123',
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });

  it('crea usuario auth y vincula chofer asignado', async () => {
    const driverRow = {
      id: 'd1',
      is_assigned_driver: true,
      owner_id: 'owner1',
      phone_normalized: normalizeDriverPhone('3878630173'),
      password_initialized: false,
      user_id: null,
      auth_email: buildAssignedDriverAuthEmail(normalizeDriverPhone('3878630173')),
      full_name: 'Juan',
    };

    const maybeSingle = jest.fn().mockResolvedValue({ data: driverRow, error: null });
    mockEq.mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({ maybeSingle }),
      }),
      update: mockUpdate,
    });

    mockCreateUser.mockResolvedValue({
      data: { user: { id: 'auth-u1' } },
      error: null,
    });

    const result = await provisionAssignedDriverAuth({
      driverId: 'd1',
      phone: '3878630173',
      password: 'password123',
    });

    expect(result.ok).toBe(true);
    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: driverRow.auth_email,
        email_confirm: true,
      }),
    );
    expect(mockUpdate).toHaveBeenCalled();
  });
});
