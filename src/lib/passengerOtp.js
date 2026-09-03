import { createClient } from '@supabase/supabase-js';
import { randomInt, randomUUID } from 'crypto';
import {
  extractLocalArMobileDigits,
  maskPhone,
  normalizePassengerPhoneForDb,
  normalizePhoneForWhatsApp,
  toWhatsAppJid,
} from './passengerAuthPhone';
import { sendWhatsmeowText, getWhatsmeowApiKey } from './whatsmeowClient';
import { listOtpWhatsmeowCandidateLines } from './whatsmeowLines';
import {
  isWhatsappLineProtectivePause,
  isWhatsappQueueTimeoutError,
  isWhatsappTransientDisconnect,
} from './whatsappAntiBan';
import { WHATSAPP_OUTBOUND_INTERVAL_MS } from './whatsappOutboundQueue';

/** Prioridad alta en whatsapp_outbound_queue (ver OUTBOUND_PRIORITY.OTP). */
const OTP_OUTBOUND_PRIORITY = 100;

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_PER_HOUR = 3;
const OTP_MAX_GLOBAL_PER_HOUR = 40;
const OTP_MAX_ATTEMPTS = 5;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const APP_REVIEW_DEMO_OTP = '2580';

function configuredOtpBypassLocal() {
  return extractLocalArMobileDigits(process.env.PASSENGER_OTP_BYPASS_PHONE || '');
}

function configuredAppReviewLocal() {
  return extractLocalArMobileDigits(process.env.PASSENGER_APP_REVIEW_PHONE || '');
}

/** Bypass opcional vía PASSENGER_OTP_BYPASS_PHONE. En producción no se define: siempre se envía OTP. */
export function isPassengerOtpBypassPhone(rawPhone) {
  const configured = configuredOtpBypassLocal();
  if (!configured) return false;
  return extractLocalArMobileDigits(rawPhone) === configured;
}

/**
 * Cuenta de App Review / Play pre-launch (opt-in).
 * Solo si PASSENGER_APP_REVIEW_PHONE está definido: no manda WhatsApp y acepta 2580.
 * Sin env, ese número recibe OTP real como cualquier pasajero.
 */
export function isAppReviewDemoPhone(rawPhone) {
  const configured = configuredAppReviewLocal();
  if (!configured) return false;
  return extractLocalArMobileDigits(rawPhone) === configured;
}

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

function isOtpLineDisconnected(reason) {
  const msg = String(reason || '').toLowerCase();
  return isWhatsappTransientDisconnect(reason) || /logged.?out/.test(msg);
}

/**
 * Una sola frase, tono de chat. Sin “código/verificación/OTP” ni markdown.
 * El índice mezcla el número con el segundo actual para que un reenvío no
 * repita la misma plantilla.
 */
const OTP_CHAT_PHRASES = [
  (n) => `Hola, para entrar a la app de Profesional usá ${n}`,
  (n) => `Hola, en Profesional Pasajero poné ${n} y seguís`,
  (n) => `Buenas, en la app de Profesional te pide ${n}`,
  (n) => `Hola, el número para la app de Profesional es ${n}`,
  (n) => `Buenas, para seguir en Profesional Pasajero usá ${n}`,
  (n) => `Hola, en la app poné ${n} y listo`,
  (n) => `Buenas, te dejo ${n} para entrar a Profesional`,
  (n) => `Hola, para abrir Profesional Pasajero usá ${n}`,
  (n) => `Buenas, en Profesional el ingreso es ${n}`,
  (n) => `Hola, si te pide un número en la app es ${n}`,
  (n) => `Buenas, para continuar en la app usá ${n}`,
  (n) => `Hola, te dejo ${n} para la app de Profesional`,
  (n) => `Buenas, anotá ${n} para entrar a Profesional Pasajero`,
  (n) => `Hola, en Profesional Pasajero el número es ${n}`,
  (n) => `Buenas, para subir a la app de Profesional poné ${n}`,
  (n) => `Hola, si estás en la app de Profesional usá ${n}`,
];

export function buildPassengerOtpMessage(code, nowMs = Date.now()) {
  const digits = String(code || '').replace(/\D/g, '').padStart(4, '0').slice(-4);
  const n = Number(digits) || 0;
  const idx = Math.abs((n * 31 + Math.floor(Number(nowMs) / 1000)) % OTP_CHAT_PHRASES.length);
  return OTP_CHAT_PHRASES[idx](digits);
}

async function readOtpLinePause(agentCode) {
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('whatsapp_line_throttle')
      .select('last_sent_at, interval_ms')
      .eq('agent_code', agentCode)
      .maybeSingle();
    return isWhatsappLineProtectivePause(data, Date.now(), WHATSAPP_OUTBOUND_INTERVAL_MS);
  } catch {
    return { paused: false, retryAfterSeconds: 0 };
  }
}

export async function sendWhatsAppOtp(phone, code) {
  const apiKey = getWhatsmeowApiKey();
  const lines = listOtpWhatsmeowCandidateLines();
  if (!apiKey || !lines[0]?.agentCode) {
    return { ok: false, reason: 'missing_whatsmeow_config' };
  }

  const dest = normalizePhoneForWhatsApp(phone);
  const to = toWhatsAppJid(phone);
  if (!dest || !to) {
    return { ok: false, reason: 'invalid_phone' };
  }

  const text = buildPassengerOtpMessage(code);
  const phoneDigits = String(phone || '').replace(/\D/g, '');
  let lastReason = 'whatsmeow_send_failed';

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const pause = await readOtpLinePause(line.agentCode);
    if (pause.paused) {
      return {
        ok: false,
        reason: 'whatsapp_line_paused',
        lineDown: true,
        retryAfterSeconds: pause.retryAfterSeconds,
      };
    }

    const logBase = {
      phone: phoneDigits,
      jid: to,
      agentCode: line.agentCode,
      attempt: i + 1,
    };

    console.info('[passenger-otp]', JSON.stringify({
      stage: 'send_attempt',
      ...logBase,
    }));

    const result = await sendWhatsmeowText(line.agentCode, dest, text, {
      apiKey,
      awaitDelivery: true,
      priority: OTP_OUTBOUND_PRIORITY,
      meta: { source: 'passenger_otp' },
    });

    if (result.success || (isWhatsappQueueTimeoutError(result.error) && result.queueId)) {
      console.info('[passenger-otp]', JSON.stringify({
        stage: result.success ? (result.queued ? 'queued' : 'send_ok') : 'queued_await_timeout',
        ...logBase,
        queueId: result.queueId || null,
        messageId: result.messageId || null,
      }));
      return {
        ok: true,
        queued: Boolean(result.queued || !result.success),
        queueId: result.queueId || null,
        messageId: result.messageId || null,
      };
    }

    lastReason = result.error || 'whatsmeow_send_failed';
    console.warn('[passenger-otp]', JSON.stringify({
      stage: 'send_fail',
      ...logBase,
      error: lastReason,
    }));

    if (!isOtpLineDisconnected(lastReason)) break;
  }

  return {
    ok: false,
    reason: lastReason,
    lineDown: isOtpLineDisconnected(lastReason),
  };
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
    const createdAt = new Date(recent[0].created_at).getTime();
    const remainingMs = OTP_RESEND_COOLDOWN_MS - (now - createdAt);
    const retryAfterSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
    return {
      ok: false,
      status: 429,
      reason: 'otp_cooldown',
      message: 'Podés pedir otro código cuando termine la espera.',
      retryAfterSeconds,
    };
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
    return {
      ok: false,
      status: 429,
      reason: 'otp_hourly_limit',
      message: 'Llegaste al límite de códigos por hora. Probá más tarde.',
    };
  }

  const { count: globalCount, error: globalError } = await supabase
    .from('passenger_otp_codes')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', hourSince);

  if (globalError) {
    if (isMissingOtpTableError(globalError)) return missingOtpTableResponse();
    throw globalError;
  }
  if ((globalCount || 0) >= OTP_MAX_GLOBAL_PER_HOUR) {
    return {
      ok: false,
      status: 429,
      reason: 'otp_global_hourly_limit',
      message: 'Hay muchos pedidos de código ahora. Probá más tarde.',
      retryAfterSeconds: 60,
    };
  }

  return { ok: true };
}

export async function createAndSendOtp(rawPhone) {
  const phone = normalizePassengerPhoneForDb(rawPhone);
  console.info('[passenger-otp]', JSON.stringify({
    stage: 'normalize',
    rawPhone: String(rawPhone || ''),
    phone: phone || null,
    jid: phone ? toWhatsAppJid(phone) : null,
  }));
  // Canónico: exactamente 54 + 10 dígitos locales (12 en total).
  if (!phone || phone.length !== 12 || !phone.startsWith('54')) {
    return { ok: false, status: 400, message: 'Ingresá un número de teléfono válido.' };
  }

  // Bypass de prueba solo si PASSENGER_OTP_BYPASS_PHONE está configurado.
  if (isPassengerOtpBypassPhone(phone)) {
    const bypass = await createBypassPassengerSession(phone);
    if (!bypass.ok) return bypass;
    return {
      ok: true,
      bypass: true,
      phone: bypass.phone,
      maskedPhone: maskPhone(bypass.phone),
      sessionToken: bypass.sessionToken,
      sessionExpiresAt: bypass.sessionExpiresAt,
      name: bypass.name,
      expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
    };
  }

  // App Review opt-in: código fijo 2580, sin WhatsApp. Requiere PASSENGER_APP_REVIEW_PHONE.
  if (isAppReviewDemoPhone(phone)) {
    const supabase = getSupabaseAdmin();
    const canSend = await assertCanSendOtp(supabase, phone);
    if (!canSend.ok) {
      console.info('[passenger-otp]', JSON.stringify({
        stage: 'blocked',
        phone,
        reason: canSend.reason || 'otp_blocked',
        status: canSend.status || 429,
        retryAfterSeconds: canSend.retryAfterSeconds || null,
      }));
      return canSend;
    }

    const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
    const { error: insertError } = await supabase.from('passenger_otp_codes').insert({
      phone,
      code: APP_REVIEW_DEMO_OTP,
      expires_at: expiresAt,
    });
    if (insertError) {
      if (isMissingOtpTableError(insertError)) return missingOtpTableResponse();
      throw insertError;
    }

    console.info('[passenger-otp]', JSON.stringify({
      stage: 'app_review_otp_silent',
      phone,
    }));

    return {
      ok: true,
      phone,
      maskedPhone: maskPhone(phone),
      expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
    };
  }

  const supabase = getSupabaseAdmin();
  const canSend = await assertCanSendOtp(supabase, phone);
  if (!canSend.ok) {
    console.info('[passenger-otp]', JSON.stringify({
      stage: 'blocked',
      phone,
      reason: canSend.reason || 'otp_blocked',
      status: canSend.status || 429,
      retryAfterSeconds: canSend.retryAfterSeconds || null,
    }));
    return canSend;
  }

  const otpLine = listOtpWhatsmeowCandidateLines()[0];
  if (otpLine?.agentCode) {
    const pause = await readOtpLinePause(otpLine.agentCode);
    if (pause.paused) {
      console.info('[passenger-otp]', JSON.stringify({
        stage: 'blocked',
        phone,
        reason: 'whatsapp_line_paused',
        retryAfterSeconds: pause.retryAfterSeconds || null,
      }));
      return {
        ok: false,
        status: 502,
        message: 'WhatsApp está en pausa de protección. Reintentá en un rato.',
        reason: 'whatsapp_line_paused',
        retryAfterSeconds: Math.min(120, pause.retryAfterSeconds || 60),
      };
    }
  }

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
    // No borrar la fila: si se borra, el cooldown de 60s no aplica y el usuario
    // puede spamear Wasender con el mismo número inválido (ráfaga de 502).
    await supabase
      .from('passenger_otp_codes')
      .update({ expires_at: new Date().toISOString() })
      .eq('phone', phone)
      .eq('code', code);
    return {
      ok: false,
      status: waResult.jidMissing ? 422 : 502,
      message: waResult.jidMissing
        ? 'Ese número no tiene WhatsApp. Usá los 10 dígitos con área, sin 0 ni 54.'
        : 'No se pudo entregar el código por WhatsApp. Reintentá cuando termine la espera.',
      reason: waResult.reason,
      retryAfterSeconds: waResult.retryAfterSeconds || OTP_RESEND_COOLDOWN_MS / 1000,
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

async function createPassengerSession(supabase, phone) {
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

/** Login de prueba sin WhatsApp/OTP — solo el número de PASSENGER_OTP_BYPASS_PHONE. */
export async function createBypassPassengerSession(rawPhone) {
  const phone = normalizePassengerPhoneForDb(rawPhone);
  if (!phone || !isPassengerOtpBypassPhone(phone)) {
    return { ok: false, status: 403, message: 'Bypass no permitido para este número.' };
  }

  console.info('[passenger-otp]', JSON.stringify({
    stage: 'bypass_login',
    phone,
  }));

  const supabase = getSupabaseAdmin();
  return createPassengerSession(supabase, phone);
}

export async function verifyOtpAndCreateSession(rawPhone, rawCode) {
  const phone = normalizePassengerPhoneForDb(rawPhone);
  const code = String(rawCode || '').replace(/\D/g, '').padStart(4, '0').slice(-4);

  if (!phone || phone.length !== 12 || !phone.startsWith('54')) {
    return { ok: false, status: 400, message: 'Teléfono inválido.' };
  }
  if (!/^\d{4}$/.test(code)) {
    return { ok: false, status: 400, message: 'Ingresá el código de 4 dígitos.' };
  }

  if (isAppReviewDemoPhone(phone) && code === APP_REVIEW_DEMO_OTP) {
    const supabase = getSupabaseAdmin();
    return createPassengerSession(supabase, phone);
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

  return createPassengerSession(supabase, phone);
}

export async function validatePassengerSession(rawPhone, sessionToken) {
  const phone = normalizePassengerPhoneForDb(rawPhone);
  const token = String(sessionToken || '').trim();

  if (!token) {
    return { ok: false, status: 400, message: 'Sesión inválida.' };
  }

  const supabase = getSupabaseAdmin();

  // Preferir match canónico phone+token; si falla, resolver por token y comparar locales.
  let data = null;
  if (phone) {
    const byPhone = await supabase
      .from('passenger_auth_sessions')
      .select('id, phone, expires_at')
      .eq('phone', phone)
      .eq('token', token)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (byPhone.error) {
      if (isMissingOtpTableError(byPhone.error)) return missingOtpTableResponse();
      throw byPhone.error;
    }
    data = byPhone.data;
  }

  if (!data) {
    const byToken = await supabase
      .from('passenger_auth_sessions')
      .select('id, phone, expires_at')
      .eq('token', token)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (byToken.error) {
      if (isMissingOtpTableError(byToken.error)) return missingOtpTableResponse();
      throw byToken.error;
    }
    data = byToken.data;

    if (data && phone) {
      const sessionLocal = extractLocalArMobileDigits(data.phone);
      const requestLocal = extractLocalArMobileDigits(phone);
      if (!sessionLocal || !requestLocal || sessionLocal !== requestLocal) {
        return { ok: false, status: 401, message: 'Tu sesión expiró. Ingresá de nuevo.' };
      }
    }
  }

  if (!data) {
    return { ok: false, status: 401, message: 'Tu sesión expiró. Ingresá de nuevo.' };
  }

  const name = await resolvePassengerName(supabase, data.phone);
  return {
    ok: true,
    phone: data.phone,
    sessionToken: token,
    sessionExpiresAt: data.expires_at,
    name,
  };
}
