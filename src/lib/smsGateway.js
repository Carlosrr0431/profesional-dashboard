import { normalizePhoneForWhatsApp } from './passengerAuthPhone';

/** Cloud pública de SMSGate. Servidor propio: SMS_GATEWAY_URL=https://tu-dominio/api/3rdparty/v1 */
export const SMS_GATEWAY_CLOUD_BASE = 'https://api.sms-gate.app/3rdparty/v1';

export function getSmsGatewayConfig(env = process.env) {
  const username = String(env.SMS_GATEWAY_USERNAME || '').trim();
  const password = String(env.SMS_GATEWAY_PASSWORD || '').trim();
  const token = String(env.SMS_GATEWAY_TOKEN || '').trim();
  const rawUrl = String(env.SMS_GATEWAY_URL || SMS_GATEWAY_CLOUD_BASE).trim();
  const baseUrl = rawUrl.replace(/\/+$/, '');
  const deviceId = String(env.SMS_GATEWAY_DEVICE_ID || '').trim();
  const simRaw = String(env.SMS_GATEWAY_SIM_NUMBER || '').trim();
  const simNumber = simRaw ? Number(simRaw) : 0;

  if (!token && !(username && password)) return null;
  if (!baseUrl) return null;

  return {
    baseUrl,
    username,
    password,
    token,
    deviceId: deviceId || null,
    simNumber: Number.isInteger(simNumber) && simNumber >= 1 ? simNumber : null,
  };
}

export function isSmsGatewayConfigured(env = process.env) {
  return Boolean(getSmsGatewayConfig(env));
}

const SMS_GATEWAY_TIMEOUT_MS = 12_000;

/** El OTP de pasajeros va siempre por SMS. Sin gateway configurado no hay fallback a WhatsApp. */
export function resolveOtpDeliveryChannel() {
  return 'sms';
}

export function isSmsGatewayAbortError(error) {
  const name = String(error?.name || '');
  const message = String(error?.message || '').toLowerCase();
  return name === 'AbortError' || name === 'TimeoutError' || message.includes('aborted');
}

/** E.164 AR móvil: +549 + 10 locales. */
export function toSmsE164(phone) {
  const digits = normalizePhoneForWhatsApp(phone);
  return digits ? `+${digits}` : '';
}

export function buildPassengerSmsOtpMessage(code) {
  const digits = String(code || '').replace(/\D/g, '').padStart(4, '0').slice(-4);
  return `Profesional Pasajero: tu codigo es ${digits}. Valido 10 minutos. No lo compartas.`;
}

export function buildSmsGatewayAuthHeader(config) {
  if (config?.token) return `Bearer ${config.token}`;
  const basic = Buffer.from(`${config.username}:${config.password}`).toString('base64');
  return `Basic ${basic}`;
}

export function buildSmsGatewayPayload({ phoneE164, text, config }) {
  const payload = {
    textMessage: { text },
    phoneNumbers: [phoneE164],
    ttl: 600,
    priority: 100,
    withDeliveryReport: true,
  };
  if (config?.deviceId) payload.deviceId = config.deviceId;
  if (config?.simNumber) payload.simNumber = config.simNumber;
  return payload;
}

export async function sendSmsGatewayMessage({
  phone,
  text,
  env = process.env,
  fetchImpl = fetch,
}) {
  const config = getSmsGatewayConfig(env);
  if (!config) return { ok: false, reason: 'missing_sms_gateway_config' };

  const phoneE164 = toSmsE164(phone);
  if (!phoneE164) return { ok: false, reason: 'invalid_phone' };

  const url = `${config.baseUrl}/messages?deviceActiveWithin=60`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SMS_GATEWAY_TIMEOUT_MS);
  if (typeof timer.unref === 'function') timer.unref();
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: buildSmsGatewayAuthHeader(config),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildSmsGatewayPayload({ phoneE164, text, config })),
      signal: controller.signal,
    });
  } catch (error) {
    if (isSmsGatewayAbortError(error)) {
      return { ok: false, reason: 'sms_gateway_timeout' };
    }
    return { ok: false, reason: error?.message || 'sms_gateway_network_error' };
  } finally {
    clearTimeout(timer);
  }

  const data = await response.json().catch(() => ({}));
  if (response.status !== 200 && response.status !== 202) {
    const msg = data?.message || data?.error || `sms_gateway_http_${response.status}`;
    return { ok: false, reason: String(msg), status: response.status };
  }

  return {
    ok: true,
    messageId: data?.id || null,
    state: data?.state || null,
  };
}

export async function sendSmsOtp(phone, code, options = {}) {
  const text = buildPassengerSmsOtpMessage(code);
  const phoneE164 = toSmsE164(phone);
  const phoneDigits = String(phone || '').replace(/\D/g, '');

  console.info('[passenger-otp]', JSON.stringify({
    stage: 'sms_send_attempt',
    phone: phoneDigits,
    e164: phoneE164 || null,
  }));

  const result = await sendSmsGatewayMessage({ phone, text, ...options });
  if (!result.ok) {
    console.warn('[passenger-otp]', JSON.stringify({
      stage: 'sms_send_fail',
      phone: phoneDigits,
      error: result.reason || null,
    }));
    return result;
  }

  console.info('[passenger-otp]', JSON.stringify({
    stage: 'sms_send_ok',
    phone: phoneDigits,
    messageId: result.messageId || null,
    state: result.state || null,
  }));
  return result;
}
