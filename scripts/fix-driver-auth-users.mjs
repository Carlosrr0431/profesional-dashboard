/**
 * Repara cuentas auth de conductores cuando auth.users está corrupto
 * y el SQL directo sobre auth.users no está permitido.
 *
 * Uso:
 *   cd profesional-dashboard
 *   node scripts/fix-driver-auth-users.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function loadEnvFile(relativePath) {
  const filePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(filePath)) return;
  const env = fs.readFileSync(filePath, 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile('.env');
loadEnvFile('.env.local');

const DEFAULT_PASSWORD = '123456';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceRoleKey || !anonKey) {
  console.error('Faltan SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o SUPABASE_ANON_KEY');
  process.exit(1);
}

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function slugify(value) {
  return String(value || 'driver')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 24) || 'driver';
}

async function verifyLogin(email, password) {
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  await anon.auth.signOut().catch(() => {});
  return { ok: true, userId: data.user.id };
}

async function repairDriver(driver) {
  const result = {
    driver_id: driver.id,
    full_name: driver.full_name,
    old_user_id: driver.user_id,
    action: null,
    email: null,
    password: DEFAULT_PASSWORD,
    error: null,
  };

  if (!driver.user_id) {
    result.action = 'missing_user_id';
    result.error = 'El conductor no tiene user_id';
    return result;
  }

  const { data: authUser, error: getError } = await admin.auth.admin.getUserById(driver.user_id);

  if (!getError && authUser?.user?.email) {
    const email = authUser.user.email;
    const { error: updateError } = await admin.auth.admin.updateUserById(driver.user_id, {
      password: DEFAULT_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: driver.full_name },
    });
    if (updateError) {
      result.action = 'update_failed';
      result.error = updateError.message;
      return result;
    }

    const login = await verifyLogin(email, DEFAULT_PASSWORD);
    if (login.ok) {
      result.action = 'password_reset';
      result.email = email;
      return result;
    }
  }

  const email = `${slugify(driver.full_name)}.${driver.driver_number || driver.id.slice(0, 8)}@profesional.test`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: DEFAULT_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: driver.full_name },
  });

  if (createError || !created?.user?.id) {
    result.action = 'recreate_failed';
    result.error = createError?.message || 'No se pudo crear usuario auth';
    return result;
  }

  const { error: linkError } = await admin
    .from('drivers')
    .update({ user_id: created.user.id })
    .eq('id', driver.id);

  if (linkError) {
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
    result.action = 'link_failed';
    result.error = linkError.message;
    return result;
  }

  const login = await verifyLogin(email, DEFAULT_PASSWORD);
  if (!login.ok) {
    result.action = 'recreated_but_login_failed';
    result.email = email;
    result.error = login.error;
    return result;
  }

  result.action = 'recreated_and_linked';
  result.email = email;
  result.new_user_id = created.user.id;
  return result;
}

const { data: drivers, error } = await admin
  .from('drivers')
  .select('id,user_id,full_name,driver_number,phone')
  .order('driver_number', { ascending: true });

if (error) {
  console.error('Error leyendo drivers:', error.message);
  process.exit(1);
}

const results = [];
for (const driver of drivers || []) {
  results.push(await repairDriver(driver));
}

console.log(JSON.stringify({ ok: true, results }, null, 2));
