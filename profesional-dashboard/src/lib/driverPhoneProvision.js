import { getSupabaseAdmin } from './supabaseAdmin';
import {
  buildAssignedDriverAuthEmail,
  buildOwnerAuthEmail,
  normalizeDriverPhone,
} from './driverRoles';

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

async function ensureAuthUser(admin, { email, password, fullName, metadata = {} }) {
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, ...metadata },
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
 * Crea o actualiza la cuenta Auth de un chofer (dueño o asignado) sin enviar correos.
 */
export async function provisionDriverPhoneAuth({ driverId, phone, password }) {
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
      'id,user_id,auth_email,phone_normalized,password_initialized,is_assigned_driver,owner_id,full_name,driver_number,role',
    )
    .eq('id', driverId)
    .maybeSingle();

  if (driverError) throw driverError;
  if (!driver?.id) {
    return { ok: false, status: 404, message: 'Chofer no encontrado' };
  }

  const isAssigned = Boolean(driver.is_assigned_driver && driver.owner_id);
  const isFleetOwner = !isAssigned && !driver.owner_id;

  if (!isAssigned && !isFleetOwner) {
    return { ok: false, status: 403, message: 'No autorizado' };
  }

  if (driver.phone_normalized !== normalizedPhone) {
    return { ok: false, status: 403, message: 'El teléfono no coincide con el registro' };
  }

  const alreadyConfigured = Boolean(driver.password_initialized && driver.user_id);
  if (alreadyConfigured) {
    return {
      ok: false,
      status: 409,
      message: 'Este perfil ya tiene contraseña. Ingresá con tu teléfono y contraseña.',
    };
  }

  const authEmail = driver.auth_email || (
    isAssigned
      ? buildAssignedDriverAuthEmail(normalizedPhone)
      : buildOwnerAuthEmail(normalizedPhone, driver.driver_number)
  );

  const metadata = isAssigned
    ? { assigned_driver: true }
    : { fleet_owner: true, driver_number: driver.driver_number };

  let userId = driver.user_id;

  if (!userId) {
    userId = await ensureAuthUser(admin, {
      email: authEmail,
      password: cleanedPassword,
      fullName: driver.full_name,
      metadata,
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

/** Cambio de contraseña desde el dashboard (admin). Crea la cuenta si aún no existe. */
export async function adminUpdateDriverPassword({ driverId, password }) {
  const cleanedPassword = String(password || '').trim();
  if (!driverId) {
    return { ok: false, status: 400, message: 'Falta el identificador del chofer' };
  }
  if (cleanedPassword.length < 8) {
    return { ok: false, status: 400, message: 'La contraseña debe tener al menos 8 caracteres' };
  }

  const admin = getSupabaseAdmin();

  const { data: driver, error: driverError } = await admin
    .from('drivers')
    .select(
      'id,user_id,auth_email,phone,phone_normalized,is_assigned_driver,owner_id,full_name,driver_number,role',
    )
    .eq('id', driverId)
    .maybeSingle();

  if (driverError) throw driverError;
  if (!driver?.id) {
    return { ok: false, status: 404, message: 'Chofer no encontrado' };
  }

  const isAssigned = Boolean(driver.is_assigned_driver && driver.owner_id);
  const normalizedPhone = driver.phone_normalized || normalizeDriverPhone(driver.phone);

  let authEmail = driver.auth_email || null;
  if (!authEmail && normalizedPhone) {
    authEmail = isAssigned
      ? buildAssignedDriverAuthEmail(normalizedPhone)
      : buildOwnerAuthEmail(normalizedPhone, driver.driver_number);
  }

  let userId = driver.user_id;

  if (!userId && authEmail) {
    userId = await findAuthUserIdByEmail(admin, authEmail);
  }

  if (userId) {
    const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
      password: cleanedPassword,
      email_confirm: true,
    });
    if (updateError) throw updateError;
  } else if (authEmail) {
    const metadata = isAssigned
      ? { assigned_driver: true }
      : { fleet_owner: true, driver_number: driver.driver_number };

    userId = await ensureAuthUser(admin, {
      email: authEmail,
      password: cleanedPassword,
      fullName: driver.full_name,
      metadata,
    });
  } else {
    return {
      ok: false,
      status: 400,
      message: 'Este chofer no tiene teléfono ni cuenta vinculada para restablecer la contraseña',
    };
  }

  const driverPatch = {
    user_id: userId,
    password_initialized: true,
    updated_at: new Date().toISOString(),
  };
  if (authEmail) driverPatch.auth_email = authEmail;
  if (normalizedPhone && !driver.phone_normalized) driverPatch.phone_normalized = normalizedPhone;

  const { error: linkError } = await admin.from('drivers').update(driverPatch).eq('id', driverId);
  if (linkError) throw linkError;

  return { ok: true, auth_email: authEmail };
}

/**
 * Actualiza el teléfono de login (owner o asignado):
 * - phone + phone_normalized en drivers
 * - auth_email si depende del número
 * - email en Supabase Auth (invalida el anterior)
 */
export async function adminUpdateDriverLoginPhone({ driverId, phone }) {
  const cleanedPhone = String(phone || '').trim();
  const normalizedPhone = normalizeDriverPhone(cleanedPhone);

  if (!driverId) {
    return { ok: false, status: 400, message: 'Falta el identificador del chofer' };
  }
  if (!normalizedPhone || normalizedPhone.length < 8) {
    return { ok: false, status: 400, message: 'Teléfono inválido' };
  }

  const admin = getSupabaseAdmin();

  const { data: driver, error: driverError } = await admin
    .from('drivers')
    .select(
      'id,user_id,auth_email,phone,phone_normalized,is_assigned_driver,owner_id,full_name,driver_number,role',
    )
    .eq('id', driverId)
    .maybeSingle();

  if (driverError) throw driverError;
  if (!driver?.id) {
    return { ok: false, status: 404, message: 'Chofer no encontrado' };
  }

  const previousNormalized = driver.phone_normalized || normalizeDriverPhone(driver.phone);
  if (previousNormalized === normalizedPhone
    && String(driver.phone || '').trim() === cleanedPhone
    && driver.phone_normalized === normalizedPhone) {
    return {
      ok: true,
      unchanged: true,
      phone: cleanedPhone,
      phone_normalized: normalizedPhone,
      auth_email: driver.auth_email || null,
    };
  }

  const isAssigned = Boolean(driver.is_assigned_driver && driver.owner_id);
  const isOwner = !isAssigned && !driver.owner_id;
  const nextAuthEmail = isAssigned
    ? buildAssignedDriverAuthEmail(normalizedPhone)
    : buildOwnerAuthEmail(normalizedPhone, driver.driver_number);

  // Conflictos de teléfono:
  // - Asignado: nunca puede compartir número
  // - Titular: puede compartir con otro titular (socios); no con un asignado
  const { data: phoneConflicts, error: phoneConflictError } = await admin
    .from('drivers')
    .select('id, full_name, is_assigned_driver, owner_id, driver_number')
    .neq('id', driverId)
    .eq('phone_normalized', normalizedPhone);

  if (phoneConflictError) throw phoneConflictError;

  const conflicts = phoneConflicts || [];
  const assignedConflicts = conflicts.filter((row) => row.is_assigned_driver && row.owner_id);
  const ownerConflicts = conflicts.filter((row) => !row.is_assigned_driver && !row.owner_id);

  if (isAssigned && conflicts.length) {
    return {
      ok: false,
      status: 409,
      message: `El teléfono ya está en uso por ${conflicts[0].full_name || 'otro chofer'}`,
    };
  }

  if (isOwner && assignedConflicts.length) {
    return {
      ok: false,
      status: 409,
      message: `El teléfono ya está en uso por el chofer asignado ${assignedConflicts[0].full_name || ''}`.trim(),
    };
  }

  let partnerOwners = [];
  if (isOwner && ownerConflicts.length) {
    if (driver.driver_number == null || String(driver.driver_number).trim() === '') {
      return {
        ok: false,
        status: 400,
        message: 'Para compartir teléfono con otro titular necesitás un Nº de chofer',
      };
    }
    const partnerWithoutNumber = ownerConflicts.find(
      (row) => row.driver_number == null || String(row.driver_number).trim() === '',
    );
    if (partnerWithoutNumber) {
      return {
        ok: false,
        status: 400,
        message: `${partnerWithoutNumber.full_name || 'El otro titular'} no tiene Nº de chofer; asignáselo antes de unir la flota`,
      };
    }
    partnerOwners = ownerConflicts.map((row) => ({
      id: row.id,
      full_name: row.full_name,
      driver_number: row.driver_number,
    }));
  }

  const { data: emailConflicts, error: emailConflictError } = await admin
    .from('drivers')
    .select('id, full_name')
    .neq('id', driverId)
    .eq('auth_email', nextAuthEmail)
    .limit(1);

  if (emailConflictError) throw emailConflictError;
  if (emailConflicts?.length) {
    return {
      ok: false,
      status: 409,
      message: `Ese teléfono ya está vinculado a otra cuenta (${emailConflicts[0].full_name || 'otro chofer'})`,
    };
  }

  let userId = driver.user_id || null;
  const previousAuthEmail = driver.auth_email || null;
  const authEmailChanged = Boolean(nextAuthEmail && nextAuthEmail !== previousAuthEmail);

  if (authEmailChanged) {
    const existingAuthUserId = await findAuthUserIdByEmail(admin, nextAuthEmail);
    if (existingAuthUserId && existingAuthUserId !== userId) {
      return {
        ok: false,
        status: 409,
        message: 'Ya existe una cuenta de acceso con ese teléfono. Usá otro número.',
      };
    }

    if (userId) {
      const { error: authUpdateError } = await admin.auth.admin.updateUserById(userId, {
        email: nextAuthEmail,
        email_confirm: true,
        user_metadata: {
          full_name: driver.full_name,
          ...(isAssigned
            ? { assigned_driver: true }
            : { fleet_owner: true, driver_number: driver.driver_number }),
        },
      });
      if (authUpdateError) throw authUpdateError;
    }
  }

  const driverPatch = {
    phone: cleanedPhone,
    phone_normalized: normalizedPhone,
    auth_email: nextAuthEmail,
    updated_at: new Date().toISOString(),
  };

  const { data: updated, error: updateError } = await admin
    .from('drivers')
    .update(driverPatch)
    .eq('id', driverId)
    .select('*')
    .single();

  if (updateError) throw updateError;

  return {
    ok: true,
    unchanged: false,
    phone: cleanedPhone,
    phone_normalized: normalizedPhone,
    auth_email: nextAuthEmail,
    previous_phone_normalized: previousNormalized || null,
    auth_email_changed: authEmailChanged,
    partnered: partnerOwners.length > 0,
    partners: partnerOwners,
    data: updated,
  };
}

/** @deprecated Usar provisionDriverPhoneAuth */
export async function provisionAssignedDriverAuth(params) {
  return provisionDriverPhoneAuth(params);
}
