import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from './supabaseAdmin';
import { extractLocalArMobileDigits } from './passengerAuthPhone';

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
  return code === '42P01' || code === 'PGRST205' || message.includes('driver_applicants');
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

export function validateApplicantProfile({ firstName, lastName, email, dni }) {
  const name = String(firstName || '').trim();
  const surname = String(lastName || '').trim();
  const mail = String(email || '').trim().toLowerCase();
  const document = String(dni || '').replace(/\D/g, '');
  if (name.length < 2) return { ok: false, message: 'Ingresá el nombre.' };
  if (surname.length < 2) return { ok: false, message: 'Ingresá el apellido.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return { ok: false, message: 'Ingresá un correo válido.' };
  if (document.length < 7 || document.length > 8) return { ok: false, message: 'El DNI tiene que tener 7 u 8 números.' };
  return { ok: true, name, surname, mail, document };
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
