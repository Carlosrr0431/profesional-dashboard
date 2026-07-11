/** Mismo dominio que conductores regulares; sin "+" (Supabase Auth lo rechaza). */
const ASSIGNED_DRIVER_EMAIL_DOMAIN = 'profesional.test';

export function normalizeDriverPhone(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  const ensureArgentinaMobile = (withCountryCode) => {
    const rest = withCountryCode.slice(2);
    if (rest.length === 11 && rest.startsWith('9')) {
      return `54${rest}`;
    }
    if (rest.length === 10) {
      return `549${rest}`;
    }
    return withCountryCode;
  };

  if (digits.startsWith('54')) {
    return ensureArgentinaMobile(digits);
  }

  if (digits.length === 11 && digits.startsWith('9')) {
    return `54${digits}`;
  }

  if (digits.length === 10) {
    return `549${digits}`;
  }

  if (digits.length < 10) {
    return ensureArgentinaMobile(`54${digits}`);
  }

  return digits;
}

export function formatPhoneForDisplay(phone) {
  const normalized = normalizeDriverPhone(phone);
  if (!normalized) return '';
  if (normalized.startsWith('54') && normalized.length >= 12) {
    return `+${normalized.slice(0, 2)} ${normalized.slice(2)}`;
  }
  return `+${normalized}`;
}

export function buildAssignedDriverAuthEmail(normalizedPhone) {
  return `assigned.${normalizedPhone}@${ASSIGNED_DRIVER_EMAIL_DOMAIN}`;
}

/** Email sintético para dueño/titular (único por número de móvil). */
export function buildOwnerAuthEmail(normalizedPhone, driverNumber = null) {
  if (driverNumber != null && String(driverNumber).trim() !== '') {
    return `owner.${driverNumber}@${ASSIGNED_DRIVER_EMAIL_DOMAIN}`;
  }
  return `owner.${normalizedPhone}@${ASSIGNED_DRIVER_EMAIL_DOMAIN}`;
}

/** Datos compartidos del vehículo y número de móvil del dueño al crear un asignado. */
export function buildAssignedDriverInsertPayload(owner, { fullName, phone, phoneNormalized, authEmail }) {
  const root = owner || {};
  return {
    owner_id: root.id,
    user_id: null,
    role: 'driver',
    is_assigned_driver: true,
    password_initialized: false,
    full_name: String(fullName || '').trim(),
    phone: String(phone || '').trim(),
    phone_normalized: phoneNormalized,
    auth_email: authEmail,
    driver_number: root.driver_number ?? null,
    vehicle_brand: root.vehicle_brand ?? null,
    vehicle_model: root.vehicle_model ?? null,
    vehicle_plate: root.vehicle_plate ?? null,
    vehicle_color: root.vehicle_color ?? null,
    vehicle_photo_url: root.vehicle_photo_url ?? null,
    vehicle_type: root.vehicle_type || 'auto',
    is_available: false,
    rating: 5.0,
    total_trips: 0,
    total_km: 0,
  };
}

export function isAssignedDriver(driver) {
  return Boolean(driver?.owner_id)
    || driver?.is_assigned_driver === true
    || driver?.isAssignedDriver === true;
}

export function isFleetRoot(driver) {
  return !isAssignedDriver(driver);
}

export function isFleetOwner(driver) {
  return (driver?.role === 'owner' || driver?.isFleetOwner === true) && !isAssignedDriver(driver);
}

/** Clave de teléfono canónica para agrupar titulares socios. */
export function getDriverPhoneKey(driver) {
  if (!driver) return '';
  return normalizeDriverPhone(driver.phone_normalized || driver.phone) || '';
}

/**
 * Titulares que comparten el mismo teléfono (socios).
 * No incluye al propio owner.
 */
export function findOwnerPartners(drivers, owner) {
  if (!owner || isAssignedDriver(owner)) return [];
  const phoneKey = getDriverPhoneKey(owner);
  if (!phoneKey) return [];
  return (drivers || []).filter(
    (d) =>
      d?.id
      && d.id !== owner.id
      && !isAssignedDriver(d)
      && getDriverPhoneKey(d) === phoneKey,
  );
}

/**
 * Clave de agrupación en lista: socios (mismo teléfono) + sus asignados juntos.
 */
export function getFleetListGroupKey(driver, ownerById = {}) {
  if (isAssignedDriver(driver)) {
    const owner = ownerById[driver.owner_id];
    const phoneKey = getDriverPhoneKey(owner);
    if (phoneKey) return `phone:${phoneKey}`;
    return `owner:${driver.owner_id || driver.id}`;
  }
  const phoneKey = getDriverPhoneKey(driver);
  if (phoneKey) return `phone:${phoneKey}`;
  return `owner:${driver.id}`;
}

export function getAssignedDriverRegistrationStatus(driver) {
  if (!driver) return 'unknown';
  if (driver.user_id && driver.password_initialized !== false) return 'registered';
  if (driver.user_id) return 'registered';
  return 'pending';
}

/**
 * Match de búsqueda para lista de choferes (mapa / gestión).
 * Acepta snake_case o camelCase. Incluye nº de móvil (#49, 49, móvil 49).
 */
export function matchesDriverSearch(driver, rawQuery, extraText = '') {
  const q = String(rawQuery || '').trim().toLowerCase();
  if (!q) return true;
  if (!driver) return false;

  const name = String(driver.full_name || driver.fullName || '').toLowerCase();
  const plate = String(driver.vehicle_plate || driver.vehiclePlate || '').toLowerCase();
  const phone = String(driver.phone || '');
  const phoneDigits = phone.replace(/\D/g, '');
  const queryDigits = q.replace(/\D/g, '');
  const driverNumber = driver.driver_number ?? driver.driverNumber;
  const numberStr = driverNumber != null && driverNumber !== '' ? String(driverNumber) : '';
  const extra = String(extraText || '').toLowerCase();

  const numberQuery = q
    .replace(/^#/, '')
    .replace(/^m[oó]vil\s*#?/, '')
    .replace(/^n[ºo°.]?\s*(de\s*)?(chofer|m[oó]vil)?\s*#?/, '')
    .trim();

  if (name.includes(q)) return true;
  if (plate.includes(q)) return true;
  if (extra && extra.includes(q)) return true;
  if (phone.toLowerCase().includes(q)) return true;
  if (queryDigits.length >= 3 && phoneDigits.includes(queryDigits)) return true;

  if (numberStr) {
    if (numberStr === numberQuery) return true;
    if (numberStr === q.replace(/^#/, '').trim()) return true;
    // Búsqueda parcial solo si no es un número puro (evita que "2" traiga 12, 20, 32…)
    if (!/^\d+$/.test(numberQuery) && numberStr.includes(numberQuery)) return true;
  }

  return false;
}

export const MAX_ASSIGNED_DRIVERS = 3;
