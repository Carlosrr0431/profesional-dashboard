jest.mock('../../src/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: jest.fn(),
}));

import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin';
import {
  adminUpdateDriverEmailLogin,
  provisionDriverEmailAuth,
} from '../../src/lib/driverPhoneProvision';

describe('login por correo del chofer', () => {
  const mockCreateUser = jest.fn();
  const mockUpdateUserById = jest.fn();
  const mockListUsers = jest.fn();
  const mockFrom = jest.fn();

  function mockDriverFetch(driver) {
    return {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({ data: driver, error: null }),
        }),
      }),
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockListUsers.mockResolvedValue({ data: { users: [] }, error: null });
    mockCreateUser.mockResolvedValue({ data: { user: { id: 'email-auth-1' } }, error: null });
    mockUpdateUserById.mockResolvedValue({ data: { user: {} }, error: null });
  });

  it('rechaza provisionar si el correo no coincide con el registro', async () => {
    mockFrom.mockReturnValue(mockDriverFetch({
      id: 'drv-1',
      login_email: 'juan@gmail.com',
      email_user_id: null,
      email_password_initialized: false,
      user_id: 'phone-auth-1',
      full_name: 'Juan',
    }));
    getSupabaseAdmin.mockReturnValue({
      from: mockFrom,
      auth: { admin: { createUser: mockCreateUser, updateUserById: mockUpdateUserById, listUsers: mockListUsers } },
    });

    const result = await provisionDriverEmailAuth({
      driverId: 'drv-1',
      email: 'otro@gmail.com',
      password: 'password123',
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });

  it('crea una cuenta Auth de correo distinta a la del teléfono', async () => {
    const driver = {
      id: 'drv-1',
      login_email: 'juan@gmail.com',
      email_user_id: null,
      email_password_initialized: false,
      user_id: 'phone-auth-1',
      full_name: 'Juan',
    };
    const mockUpdate = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: null }),
    });
    mockFrom.mockImplementation((table) => {
      if (table === 'drivers') {
        return {
          ...mockDriverFetch(driver),
          update: mockUpdate,
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({ data: driver, error: null }),
            }),
            or: jest.fn().mockReturnValue({
              neq: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({ data: [], error: null }),
              }),
              limit: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }
      return {};
    });
    getSupabaseAdmin.mockReturnValue({
      from: mockFrom,
      auth: { admin: { createUser: mockCreateUser, updateUserById: mockUpdateUserById, listUsers: mockListUsers } },
    });

    const result = await provisionDriverEmailAuth({
      driverId: 'drv-1',
      email: 'juan@gmail.com',
      password: 'correoClave1',
    });

    expect(result.ok).toBe(true);
    expect(result.login_email).toBe('juan@gmail.com');
    expect(mockCreateUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'juan@gmail.com',
      password: 'correoClave1',
    }));
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      email_user_id: 'email-auth-1',
      email_password_initialized: true,
    }));
  });

  it('guarda el correo y cambia solo la clave de correo', async () => {
    const driver = {
      id: 'drv-1',
      login_email: null,
      email_user_id: null,
      email_password_initialized: false,
      user_id: 'phone-auth-1',
      full_name: 'Juan',
    };
    const mockUpdate = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: null }),
    });
    mockFrom.mockImplementation(() => ({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockImplementation((column) => {
          if (column === 'login_email') {
            return Promise.resolve({ data: [], error: null });
          }
          return {
            maybeSingle: jest.fn().mockResolvedValue({ data: driver, error: null }),
          };
        }),
        or: jest.fn().mockResolvedValue({ data: [], error: null }),
      }),
      update: mockUpdate,
    }));
    getSupabaseAdmin.mockReturnValue({
      from: mockFrom,
      auth: { admin: { createUser: mockCreateUser, updateUserById: mockUpdateUserById, listUsers: mockListUsers } },
    });

    const result = await adminUpdateDriverEmailLogin({
      driverId: 'drv-1',
      loginEmail: 'juan@gmail.com',
      password: 'correoClave1',
    });

    expect(result.ok).toBe(true);
    expect(result.login_email).toBe('juan@gmail.com');
    expect(result.password_updated).toBe(true);
    expect(mockCreateUser).toHaveBeenCalled();
  });

  it('no reutiliza el user_id del teléfono para el correo', async () => {
    const driver = {
      id: 'drv-1',
      login_email: 'juan@gmail.com',
      email_user_id: null,
      email_password_initialized: false,
      user_id: 'phone-auth-1',
      full_name: 'Juan',
    };
    mockListUsers.mockResolvedValue({
      data: { users: [{ id: 'phone-auth-1', email: 'juan@gmail.com' }] },
      error: null,
    });
    mockFrom.mockReturnValue(mockDriverFetch(driver));
    getSupabaseAdmin.mockReturnValue({
      from: mockFrom,
      auth: { admin: { createUser: mockCreateUser, updateUserById: mockUpdateUserById, listUsers: mockListUsers } },
    });

    const result = await provisionDriverEmailAuth({
      driverId: 'drv-1',
      email: 'juan@gmail.com',
      password: 'correoClave1',
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });
});
