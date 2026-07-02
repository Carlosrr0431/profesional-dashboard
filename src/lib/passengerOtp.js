import { createClient } from '@supabase/supabase-js';
import { randomInt, randomUUID } from 'crypto';
import {
  maskPhone,
  normalizePassengerPhoneForDb,
  toWhatsAppJid,
} from './passengerAuthPhone';

const WASENDER_API_KEY = process.env.WASENDER_API_KEY || '';
const WASENDER_BASE_URL = process.env.WASENDER_BASE_URL || 'https://www.wasenderapi.com/api';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_PER_HOUR = 5;
const OTP_MAX_ATTEMPTS = 5;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function isMissingOtpTableError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return (
    code === '42P01'
    || code === 'PGRST205'
    || message.includes('passenger_otp_codes')
  );
}

function missingOtpTableResponse() {
  return {
    ok: false,
    status: 503,
    message: 'Falta configurar la base de datos de OTP. Ejecutá passenger_otp_auth.sql en Supabase.',
  };
}

export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function generateOtpCode() {
  return String(randomInt(1000, 10000));
}

export async function sendWhatsAppOtp(phone, code) {
  if (!WASENDER_API_KEY) {
    return { ok: false, reason: 'missing_wasender_api_key' };
  }

  const to = toWhatsAppJid(phone);
  if (!to) {
    return { ok: false, reason: 'invalid_phone' };
  }

  const text =
    `Tu código de verificación de *Profesional Pasajero* es: *${code}*\n\n`
    + 'Válido por 10 minutos. No lo compartas con nadie.';

  const response = await fetch(`${WASENDER_BASE_URL}/send-message`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WASENDER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ to, text }),
  });

  const rawBody = await response.text().catch(() => '');
  let payload = null;
  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      reason: `whatsapp_send_error:http_${response.status}:${rawBody.slice(0, 120) || 'no_body'}`,
    };
  }

  const apiError = payload?.error || payload?.errors
    || (payload?.success === false ? payload?.message : null);
  if (apiError) {
    return { ok: false, reason: `whatsapp_send_error:${String(apiError).slice(0, 120)}` };
  }

  return { ok: true, to, msgId: payload?.data?.msgId ? String(payload.data.msgId) : null };
}

export async function assertCanSendOtp(supabase, phone) {
  const now = Date.now();
  const cooldownSince = new Date(now - OTP_RESEND_COOLDOWN_MS).toISOString();
  const hourSince = new Date(now - 60 * 60 * 1000).toISOString();

  const { data: recent, error: recentError } = await supabase
    .from('passenger_otp_codes')
    .select('id, created_at')
    .eq('phone', phone)
    .gte('created_at', cooldownSince)
    .order('created_at', { ascending: false })
    .limit(1);

  if (recentError) {
    if (isMissingOtpTableError(recentError)) return missingOtpTableResponse();
    throw recentError;
  }
  if (recent?.length) {
    return { ok: false, status: 429, message: 'Esperá un minuto antes de pedir otro código.' };
  }

  const { count, error: countError } = await supabase
    .from('passenger_otp_codes')
    .select('id', { count: 'exact', head: true })
    .eq('phone', phone)
    .gte('created_at', hourSince);

  if (countError) {
    if (isMissingOtpTableError(countError)) return missingOtpTableResponse();
    throw countError;
  }
  if ((count || 0) >= OTP_MAX_PER_HOUR) {
    return { ok: false, status: 429, message: 'Demasiados intentos. Probá de nuevo en una hora.' };
  }

  return { ok: true };
}

export async function createAndSendOtp(rawPhone) {
  const phone = normalizePassengerPhoneForDb(rawPhone);
  if (!phone || phone.length < 11) {
    return { ok: false, status: 400, message: 'Ingresá un número de teléfono válido.' };
  }

  const supabase = getSupabaseAdmin();
  const canSend = await assertCanSendOtp(supabase, phone);
  if (!canSend.ok) return canSend;

  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

  const { error: insertError } = await supabase.from('passenger_otp_codes').insert({
    phone,
    code,
    expires_at: expiresAt,
  });

  if (insertError) {
    if (isMissingOtpTableError(insertError)) return missingOtpTableResponse();
    throw insertError;
  }

  const waResult = await sendWhatsAppOtp(phone, code);
  if (!waResult.ok) {
    await supabase.from('passenger_otp_codes').delete().eq('phone', phone).eq('code', code);
    return {
      ok: false,
      status: 502,
      message: 'No pudimos enviar el código por WhatsApp. Verificá el número e intentá de nuevo.',
      reason: waResult.reason,
    };
  }

  return {
    ok: true,
    phone,
    maskedPhone: maskPhone(phone),
    expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
  };
}

async function resolvePassengerName(supabase, phone) {
  const { data } = await supabase
    .from('trips')
    .select('passenger_name')
    .eq('passenger_phone', phone)
    .not('passenger_name', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const name = String(data?.passenger_name || '').trim();
  return name.length >= 2 ? name : 'Pasajero';
}

export async function verifyOtpAndCreateSession(rawPhone, rawCode) {
  const phone = normalizePassengerPhoneForDb(rawPhone);
  const code = String(rawCode || '').replace(/\D/g, '').padStart(4, '0').slice(-4);

  if (!phone || phone.length < 11) {
    return { ok: false, status: 400, message: 'Teléfono inválido.' };
  }
  if (!/^\d{4}$/.test(code)) {
    return { ok: false, status: 400, message: 'Ingresá el código de 4 dígitos.' };
  }

  const supabase = getSupabaseAdmin();

  const { data: otpRow, error: otpError } = await supabase
    .from('passenger_otp_codes')
    .select('id, code, attempts, expires_at, verified_at')
    .eq('phone', phone)
    .is('verified_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (otpError) {
    if (isMissingOtpTableError(otpError)) return missingOtpTableResponse();
    throw otpError;
  }

  if (!otpRow) {
    return { ok: false, status: 400, message: 'El código expiró o no existe. Pedí uno nuevo.' };
  }

  if ((otpRow.attempts || 0) >= OTP_MAX_ATTEMPTS) {
    return { ok: false, status: 429, message: 'Demasiados intentos fallidos. Pedí un código nuevo.' };
  }

  if (otpRow.code !== code) {
    await supabase
      .from('passenger_otp_codes')
      .update({ attempts: (otpRow.attempts || 0) + 1 })
      .eq('id', otpRow.id);

    return { ok: false, status: 400, message: 'Código incorrecto. Revisalo e intentá de nuevo.' };
  }

  const verifiedAt = new Date().toISOString();
  await supabase
    .from('passenger_otp_codes')
    .update({ verified_at: verifiedAt })
    .eq('id', otpRow.id);

  const sessionToken = randomUUID();
  const sessionExpiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  // Upsert por phone: un registro activo por pasajero.
  // Si ya existe una sesión (mismo phone), la renueva sin borrar el push_token.
  const { error: sessionError } = await supabase
    .from('passenger_auth_sessions')
    .upsert(
      { phone, token: sessionToken, expires_at: sessionExpiresAt, updated_at: new Date().toISOString() },
      { onConflict: 'phone', ignoreDuplicates: false }
    );

  if (sessionError) {
    if (isMissingOtpTableError(sessionError)) return missingOtpTableResponse();
    throw sessionError;
  }

  const name = await resolvePassengerName(supabase, phone);

  return {
    ok: true,
    phone,
    sessionToken,
    sessionExpiresAt,
    name,
  };
}

export async function validatePassengerSession(rawPhone, sessionToken) {
  const phone = normalizePassengerPhoneForDb(rawPhone);
  const token = String(sessionToken || '').trim();

  if (!phone || !token) {
    return { ok: false, status: 400, message: 'Sesión inválida.' };
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('passenger_auth_sessions')
    .select('id, phone, expires_at')
    .eq('phone', phone)
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) {
    if (isMissingOtpTableError(error)) return missingOtpTableResponse();
    throw error;
  }
  if (!data) {
    return { ok: false, status: 401, message: 'Tu sesión expiró. Ingresá de nuevo.' };
  }

  const name = await resolvePassengerName(supabase, phone);
  return {
    ok: true,
    phone: data.phone,
    sessionToken: token,
    sessionExpiresAt: data.expires_at,
    name,
  };
}
