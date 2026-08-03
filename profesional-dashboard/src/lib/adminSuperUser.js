const DEFAULT_SUPER_ADMIN_EMAIL = 'carlos.facundo.rr@gmail.com';

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
