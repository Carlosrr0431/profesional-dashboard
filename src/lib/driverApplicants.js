import { randomInt, randomUUID } from 'crypto';
import { getSupabaseAdmin } from './supabaseAdmin';
import { extractLocalArMobileDigits, normalizePassengerPhoneForDb } from './passengerAuthPhone';
import { normalizeDriverPhone } from './driverRoles';
import { sendBrevoEmail, applicantOtpEmail } from './brevoMail';

export const APPLICANT_BUCKET = 'driver-applicant-docs';
export const APPLICANT_SESSION_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export const APPLICANT_DOC_STEPS = [
  { key: 'dni', title: 'Fotocopia de DNI', hint: 'Frente y dorso del DNI del chofer.' },
  { key: 'license', title: 'Licencia nacional de conducir', hint: 'Fotocopia de la licencia vigente.' },
  { key: 'vehicle_title', title: 'Cédula y título del vehículo', hint: 'O la autorización para usarlo en plataformas.' },
  { key: 'owner_dni', title: 'DNI del propietario', hint: 'Fotocopia del DNI de quien figura como dueño.' },
  { key: 'tax_clearance', title: 'Libre deuda de radicación', hint: 'Impuesto a la radicación, Municipalidad de Salta Capital.' },
  { key: 'background', title: 'Certificado de antecedentes', hint: 'Nacional o provincial.' },
  { key: 'insurance', title: 'Póliza de seguro', hint: 'Fotocopia de la póliza vigente.' },
  { key: 'rto', title: 'RTO / VTV', hint: 'Verificación técnica vigente.' },
];

const DOC_KEYS = new Set(APPLICANT_DOC_STEPS.map((step) => step.key));
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export function vehicleRequirementError({ kind, year, cc } = {}, now = new Date()) {
  const current = now.getFullYear();
  const y = Number(year);
  if (kind !== 'car' && kind !== 'moto') {
    return 'Indicá si es un auto (o más de dos ruedas) o una moto.';
  }
  if (!Number.isInteger(y) || y < 1980 || y > current) {
    return 'Indicá el año de fabricación.';
  }
  const age = current - y;
  if (kind === 'car' && age > 15) {
    return 'Los vehículos de más de dos ruedas pueden tener hasta 15 años desde la fabricación.';
  }
  if (kind === 'moto' && age > 10) {
    return 'Las motos pueden tener hasta 10 años desde la fabricación.';
  }
  if (kind === 'moto') {
    const displacement = Number(cc);
    if (!Number.isInteger(displacement) || displacement < 110) {
      return 'La moto tiene que tener al menos 110 cc.';
    }
  }
  return null;
}

export function missingApplicantDocs(docKeys = []) {
  const present = new Set(docKeys);
  return APPLICANT_DOC_STEPS.filter((step) => !present.has(step.key)).map((step) => step.key);
}

export function isApplicantDocKey(value) {
  return DOC_KEYS.has(String(value || ''));
}

export function isMissingApplicantTable(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return code === '42P01' || code === 'PGRST205' || message.includes('driver_applicant');
}

export function missingApplicantTableResponse() {
  return {
    ok: false,
    status: 503,
    message: 'Falta crear las tablas de aspirantes. Ejecutá driver_applicants.sql en Supabase.',
  };
}

function clientHeader(req, payload) {
  return String(
    req?.headers?.get?.('x-profesional-client')
    || payload?.client
    || ''
  ).trim();
}

export function isDriverApplicantClient(req, payload) {
  return clientHeader(req, payload).startsWith('driver-app/');
}

export async function findRegisteredDriverByPhone(phone) {
  const local = extractLocalArMobileDigits(phone);
  if (!local) return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('drivers')
    .select('id, phone')
    .ilike('phone', `%${local}%`)
    .limit(8);
  if (error) throw error;
  return (data || []).find((row) => extractLocalArMobileDigits(row.phone) === local) || null;
}

export async function upsertApplicantByPhone(phone) {
  const supabase = getSupabaseAdmin();
  const { data: existing, error: readError } = await supabase
    .from('driver_applicants')
    .select('id, status')
    .eq('phone', phone)
    .maybeSingle();
  if (readError) {
    if (isMissingApplicantTable(readError)) return missingApplicantTableResponse();
    throw readError;
  }
  if (existing?.id) return { ok: true, applicantId: existing.id, status: existing.status };

  const { data, error } = await supabase
    .from('driver_applicants')
    .insert({ phone, status: 'phone_verified' })
    .select('id, status')
    .single();
  if (error) {
    if (isMissingApplicantTable(error)) return missingApplicantTableResponse();
    throw error;
  }
  return { ok: true, applicantId: data.id, status: data.status };
}

export async function findRegisteredDriverByEmail(email) {
  const mail = normalizeApplicantEmail(email);
  if (!mail) return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('drivers')
    .select('id')
    .ilike('login_email', mail)
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

export async function upsertApplicantByEmail(email) {
  const mail = normalizeApplicantEmail(email);
  if (!mail) return { ok: false, status: 400, message: 'Ingresá un correo válido.' };
  const supabase = getSupabaseAdmin();
  const { data: existing, error: readError } = await supabase
    .from('driver_applicants')
    .select('id, status')
    .ilike('email', mail)
    .limit(1);
  if (readError) {
    if (isMissingApplicantTable(readError)) return missingApplicantTableResponse();
    throw readError;
  }
  if (existing?.[0]?.id) {
    return { ok: true, applicantId: existing[0].id, status: existing[0].status };
  }

  const { data, error } = await supabase
    .from('driver_applicants')
    .insert({ email: mail, status: 'phone_verified' })
    .select('id, status')
    .single();
  if (error) {
    if (isMissingApplicantTable(error)) return missingApplicantTableResponse();
    throw error;
  }
  return { ok: true, applicantId: data.id, status: data.status };
}

export const REJECTED_APPLICANT_MESSAGE = 'Esta solicitud fue rechazada. No podés empezar otra con este teléfono o este correo.';

export async function rejectedApplicantBlock({ phone, email } = {}) {
  const supabase = getSupabaseAdmin();
  const mail = normalizeApplicantEmail(email);
  const local = extractLocalArMobileDigits(phone);

  if (mail) {
    const { data, error } = await supabase
      .from('driver_applicants')
      .select('id, status')
      .ilike('email', mail)
      .limit(1);
    if (error) {
      if (isMissingApplicantTable(error)) return null;
      throw error;
    }
    if (data?.[0]?.status === 'rejected') {
      return { ok: false, status: 403, rejected: true, message: REJECTED_APPLICANT_MESSAGE };
    }
  }

  if (!local) return null;
  const { data, error } = await supabase
    .from('driver_applicants')
    .select('id, status, phone')
    .ilike('phone', `%${local}%`)
    .limit(8);
  if (error) {
    if (isMissingApplicantTable(error)) return null;
    throw error;
  }
  const match = (data || []).find((row) => extractLocalArMobileDigits(row.phone) === local);
  if (match?.status === 'rejected') {
    return { ok: false, status: 403, rejected: true, message: REJECTED_APPLICANT_MESSAGE };
  }
  return null;
}

const EMAIL_OTP_TTL_MS = 10 * 60 * 1000;
const EMAIL_OTP_MAX_ATTEMPTS = 5;

export async function createAndSendApplicantEmailOtp(email) {
  const mail = normalizeApplicantEmail(email);
  if (!mail) return { ok: false, status: 400, message: 'Ingresá un correo válido.' };
  const already = await findRegisteredDriverByEmail(mail);
  if (already) {
    return { ok: false, status: 409, message: 'Este correo ya es chofer. Ingresá con tu cuenta.' };
  }
  const blocked = await rejectedApplicantBlock({ email: mail });
  if (blocked) return blocked;

  const code = String(randomInt(1000, 10000));
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('driver_applicant_email_codes').insert({
    email: mail,
    code,
    expires_at: new Date(Date.now() + EMAIL_OTP_TTL_MS).toISOString(),
  });
  if (error) {
    if (isMissingApplicantTable(error)) return missingApplicantTableResponse();
    throw error;
  }

  const sent = await sendBrevoEmail({
    to: mail,
    subject: 'Tu código de Profesional Conductor',
    text: `Tu código para sumarte como chofer es ${code}. Vence en 10 minutos.`,
  });
  if (!sent.ok) return sent;
  return {
    ok: true,
    email: mail,
    expiresInSeconds: 600,
    channel: 'email',
    message: 'Te enviamos un código por correo.',
  };
}

export async function consumeApplicantEmailOtp(email, rawCode) {
  const mail = normalizeApplicantEmail(email);
  const code = String(rawCode || '').replace(/\D/g, '');
  if (!mail) return { ok: false, status: 400, message: 'Ingresá un correo válido.' };
  if (code.length !== 4) return { ok: false, status: 400, message: 'El código tiene 4 números.' };

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('driver_applicant_email_codes')
    .select('id, code, attempts, expires_at, verified_at')
    .eq('email', mail)
    .is('verified_at', null)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) {
    if (isMissingApplicantTable(error)) return missingApplicantTableResponse();
    throw error;
  }
  const row = data?.[0];
  if (!row || new Date(row.expires_at).getTime() <= Date.now()) {
    return { ok: false, status: 400, message: 'El código venció. Pedí uno nuevo.' };
  }
  if (row.attempts >= EMAIL_OTP_MAX_ATTEMPTS) {
    return { ok: false, status: 400, message: 'Demasiados intentos. Pedí un código nuevo.' };
  }
  if (row.code !== code) {
    await supabase
      .from('driver_applicant_email_codes')
      .update({ attempts: row.attempts + 1 })
      .eq('id', row.id);
    return { ok: false, status: 400, message: 'El código no coincide.' };
  }
  await supabase
    .from('driver_applicant_email_codes')
    .update({ verified_at: new Date().toISOString() })
    .eq('id', row.id);
  return { ok: true, email: mail };
}

export async function createApplicantSession(applicantId) {
  const supabase = getSupabaseAdmin();
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + APPLICANT_SESSION_MS).toISOString();
  const { error } = await supabase.from('driver_applicant_sessions').insert({
    token,
    applicant_id: applicantId,
    expires_at: expiresAt,
  });
  if (error) {
    if (isMissingApplicantTable(error)) return missingApplicantTableResponse();
    throw error;
  }
  return { ok: true, token, expiresAt };
}

export async function requireApplicant(token) {
  const value = String(token || '').trim();
  if (!value) return { ok: false, status: 401, message: 'La verificación venció. Confirmá el teléfono de nuevo.' };
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('driver_applicant_sessions')
    .select('token, expires_at, applicant_id')
    .eq('token', value)
    .maybeSingle();
  if (error) {
    if (isMissingApplicantTable(error)) return missingApplicantTableResponse();
    throw error;
  }
  if (!data?.applicant_id || new Date(data.expires_at).getTime() <= Date.now()) {
    return { ok: false, status: 401, message: 'La verificación venció. Confirmá el teléfono de nuevo.' };
  }
  const { data: applicant, error: applicantError } = await supabase
    .from('driver_applicants')
    .select('*')
    .eq('id', data.applicant_id)
    .maybeSingle();
  if (applicantError) throw applicantError;
  if (!applicant?.id) {
    return { ok: false, status: 401, message: 'La verificación venció. Confirmá el teléfono de nuevo.' };
  }
  return { ok: true, supabase, applicant };
}

export function buildAcceptedDriverInsert(applicant, driverNumber) {
  const email = normalizeApplicantEmail(applicant?.email);
  const phoneNormalized = normalizeDriverPhone(applicant?.phone) || null;
  const fullName = [applicant?.first_name, applicant?.last_name].filter(Boolean).join(' ').trim() || 'Chofer';
  return {
    user_id: null,
    email_user_id: null,
    email_password_initialized: false,
    password_initialized: false,
    is_assigned_driver: false,
    full_name: fullName,
    phone: phoneNormalized,
    phone_normalized: phoneNormalized,
    login_email: email || null,
    driver_number: driverNumber,
    vehicle_type: applicant?.vehicle_kind === 'moto' ? 'moto' : 'auto',
    billing_mode: 'commission_current',
  };
}

export async function ensureDriverForAcceptedApplicant(applicant) {
  const supabase = getSupabaseAdmin();
  const email = normalizeApplicantEmail(applicant?.email);
  if (email) {
    const { data, error } = await supabase
      .from('drivers')
      .select('id, driver_number')
      .ilike('login_email', email)
      .limit(1);
    if (error) throw error;
    if (data?.[0]?.id) {
      return { id: data[0].id, driverNumber: data[0].driver_number, created: false };
    }
  }

  if (applicant?.phone) {
    const existingPhone = await findRegisteredDriverByPhone(applicant.phone);
    if (existingPhone?.id) {
      return { id: existingPhone.id, driverNumber: null, created: false };
    }
  }

  const { data: top, error: numberError } = await supabase
    .from('drivers')
    .select('driver_number')
    .not('driver_number', 'is', null)
    .order('driver_number', { ascending: false })
    .limit(1);
  if (numberError) throw numberError;
  const driverNumber = (Number(top?.[0]?.driver_number) || 0) + 1;
  const { data: created, error } = await supabase
    .from('drivers')
    .insert(buildAcceptedDriverInsert(applicant, driverNumber))
    .select('id, driver_number')
    .single();
  if (error) throw error;
  return { id: created.id, driverNumber: created.driver_number, created: true };
}

export function normalizeApplicantEmail(value) {
  const mail = String(value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return '';
  if (mail.endsWith('@profesional.test')) return '';
  return mail;
}

export function validateApplicantProfile(payload = {}, applicant = {}) {
  const name = String(payload.firstName || '').trim();
  const surname = String(payload.lastName || '').trim();
  const mail = normalizeApplicantEmail(applicant.email) || normalizeApplicantEmail(payload.email);
  const document = String(payload.dni || '').replace(/\D/g, '');
  if (name.length < 2) return { ok: false, message: 'Ingresá el nombre.' };
  if (surname.length < 2) return { ok: false, message: 'Ingresá el apellido.' };
  if (!mail) return { ok: false, message: 'Ingresá un correo válido.' };
  if (document.length < 7 || document.length > 8) return { ok: false, message: 'El DNI tiene que tener 7 u 8 números.' };

  let phone = applicant.phone || null;
  if (!phone) {
    phone = normalizePassengerPhoneForDb(payload.phone);
    if (!phone || phone.length !== 12) {
      return { ok: false, message: 'Ingresá tu celular con 10 números, sin 0 ni 15.' };
    }
  }
  return { ok: true, name, surname, mail, document, phone };
}

export function applicantDraftPatch(payload = {}, applicant = {}) {
  const patch = {};
  const name = String(payload.firstName || '').trim();
  const surname = String(payload.lastName || '').trim();
  if (name.length >= 2) patch.first_name = name;
  if (surname.length >= 2) patch.last_name = surname;
  if (!normalizeApplicantEmail(applicant.email)) {
    const mail = normalizeApplicantEmail(payload.email);
    if (mail) patch.email = mail;
  }
  if (!applicant.phone) {
    const phone = normalizePassengerPhoneForDb(payload.phone);
    if (phone && phone.length === 12) patch.phone = phone;
  }
  const document = String(payload.dni || '').replace(/\D/g, '');
  if (document.length >= 7 && document.length <= 8) patch.dni = document;
  const kind = payload.vehicleKind === 'car' || payload.vehicleKind === 'moto' ? payload.vehicleKind : '';
  if (kind) patch.vehicle_kind = kind;
  const year = Number(payload.vehicleYear);
  const current = new Date().getFullYear();
  if (Number.isInteger(year) && year >= 1980 && year <= current) patch.vehicle_year = year;
  const cc = Number(payload.vehicleCc);
  if ((kind || applicant.vehicle_kind) === 'moto' && Number.isInteger(cc) && cc >= 110) {
    patch.vehicle_cc = cc;
  }
  if (kind === 'car') patch.vehicle_cc = null;
  return patch;
}

export function inspectApplicantFile(file) {
  if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') {
    return { ok: false, message: 'Elegí una foto del documento.' };
  }
  const mime = String(file.type || '').toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    return { ok: false, message: 'Subí una foto (JPG, PNG o HEIC).' };
  }
  const size = Number(file.size || 0);
  if (size > MAX_FILE_BYTES) {
    return { ok: false, message: 'Cada foto puede pesar hasta 5 MB.' };
  }
  return { ok: true, mime };
}

export function applicantStorageName(originalName) {
  const base = String(originalName || 'foto.jpg').split(/[/\\]/).pop();
  const clean = base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  return clean || 'foto.jpg';
}
