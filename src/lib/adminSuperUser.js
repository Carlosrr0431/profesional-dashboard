const DEFAULT_SUPER_ADMIN_EMAIL = 'carlos.facundo.rr@gmail.com';
const DRIVER_AUTH_EMAIL_DOMAIN = '@profesional.test';

export const DASHBOARD_ACCESS_DENIED = 'DASHBOARD_ACCESS_DENIED';

export function getSuperAdminEmail() {
  const fromEnv = typeof process !== 'undefined' ? process.env.ADMIN_SUPER_USER_EMAIL : '';
  const email = String(fromEnv || DEFAULT_SUPER_ADMIN_EMAIL).trim().toLowerCase();
  return email || DEFAULT_SUPER_ADMIN_EMAIL;
}

export function isSuperAdminEmail(email) {
  return String(email || '').trim().toLowerCase() === getSuperAdminEmail();
}

export function isSuperAdminUser(user) {
  return isSuperAdminEmail(user?.email);
}

export function isDriverAuthEmail(email) {
  return String(email || '').trim().toLowerCase().endsWith(DRIVER_AUTH_EMAIL_DOMAIN);
}

function getAuthUserRole(user) {
  return String(user?.app_metadata?.role || user?.user_metadata?.role || '').trim().toLowerCase();
}

/** Operador del dashboard: super admin o cuenta creada con role admin. Nunca emails de choferes. */
export function isDashboardOperatorUser(user) {
  if (!user) return false;
  const email = String(user.email || '').trim().toLowerCase();
  if (!email || isDriverAuthEmail(email)) return false;
  if (isSuperAdminEmail(email)) return true;
  return getAuthUserRole(user) === 'admin';
}
