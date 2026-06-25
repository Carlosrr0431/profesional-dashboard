import { getSupabaseAdmin } from './supabaseAdmin';
import { buildAssignedDriverAuthEmail, normalizeDriverPhone } from './driverRoles';

function isDuplicateAuthUserError(error) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('already') || msg.includes('registered') || msg.includes('exists');
}

async function findAuthUserIdByEmail(admin, email) {
  const target = email.toLowerCase();
  let page = 1;

  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;

    const users = data?.users || [];
    const match = users.find((u) => String(u.email || '').toLowerCase() === target);
    if (match?.id) return match.id;

    if (users.length < 200) break;
    page += 1;
  }

  return null;
}

async function ensureAuthUser(admin, { email, password, fullName }) {
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, assigned_driver: true },
  });

  if (!createError && created?.user?.id) {
    return created.user.id;
  }

  if (createError && isDuplicateAuthUserError(createError)) {
    const userId = await findAuthUserIdByEmail(admin, email);
    if (!userId) throw createError;

    const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (updateError) throw updateError;
    return userId;
  }

  throw createError || new Error('No se pudo crear la cuenta de autenticación');
}

/**
 * Crea o actualiza la cuenta Auth de un chofer asignado sin enviar correos
 * (evita rate limit de signUp desde el cliente).
 */
export async function provisionAssignedDriverAuth({ driverId, phone, password }) {
  const normalizedPhone = normalizeDriverPhone(phone);
  const cleanedPassword = String(password || '');

  if (!driverId) {
    return { ok: false, status: 400, message: 'Falta el identificador del chofer' };
  }
  if (!normalizedPhone || normalizedPhone.length < 8) {
    return { ok: false, status: 400, message: 'Teléfono inválido' };
  }
  if (cleanedPassword.length < 8) {
    return { ok: false, status: 400, message: 'La contraseña debe tener al menos 8 caracteres' };
  }

  const admin = getSupabaseAdmin();

  const { data: driver, error: driverError } = await admin
    .from('drivers')
    .select(
      'id,user_id,auth_email,phone_normalized,password_initialized,is_assigned_driver,owner_id,full_name',
    )
    .eq('id', driverId)
    .maybeSingle();

  if (driverError) throw driverError;

  if (!driver?.is_assigned_driver || !driver.owner_id) {
    return { ok: false, status: 403, message: 'No autorizado' };
  }

  if (driver.phone_normalized !== normalizedPhone) {
    return { ok: false, status: 403, message: 'El teléfono no coincide con el chofer asignado' };
  }

  const alreadyConfigured = Boolean(driver.password_initialized && driver.user_id);
  if (alreadyConfigured) {
    return {
      ok: false,
      status: 409,
      message: 'Este chofer ya tiene contraseña. Ingresá con tu teléfono y contraseña.',
    };
  }

  const authEmail = driver.auth_email || buildAssignedDriverAuthEmail(normalizedPhone);
  let userId = driver.user_id;

  if (!userId) {
    userId = await ensureAuthUser(admin, {
      email: authEmail,
      password: cleanedPassword,
      fullName: driver.full_name,
    });
  } else {
    const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
      password: cleanedPassword,
      email_confirm: true,
    });
    if (updateError) throw updateError;
  }

  const { error: linkError } = await admin
    .from('drivers')
    .update({
      user_id: userId,
      auth_email: authEmail,
      password_initialized: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', driverId);

  if (linkError) throw linkError;

  return { ok: true, auth_email: authEmail };
}
