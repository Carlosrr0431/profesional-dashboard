import { normalizePhoneForWhatsApp } from './passengerAuthPhone';

/** Cloud pública de SMSGate. Servidor propio: SMS_GATEWAY_URL=https://tu-dominio/api/3rdparty/v1 */
export const SMS_GATEWAY_CLOUD_BASE = 'https://api.sms-gate.app/3rdparty/v1';

/** SMSGate mide esto en horas (0 = sin filtro). 1 = dispositivo visto en la última hora. */
export const SMS_GATEWAY_DEVICE_ACTIVE_WITHIN_HOURS = 1;

const SMS_GATEWAY_TIMEOUT_MS = 12_000;
const SMS_GATEWAY_WAIT_SENT_MS = 8_000;
const SMS_GATEWAY_POLL_MS = 800;
const SMS_SENT_STATES = new Set(['Processed', 'Sent', 'Delivered']);
const SMS_FAIL_STATES = new Set(['Failed', 'Cancelled']);

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

/** El OTP de pasajeros va siempre por SMS. Sin gateway configurado no hay fallback a WhatsApp. */
export function resolveOtpDeliveryChannel() {
  return 'sms';
}

export function isSmsGatewayAbortError(error) {
  const name = String(error?.name || '');
  const message = String(error?.message || '').toLowerCase();
  return name === 'AbortError' || name === 'TimeoutError' || message.includes('aborted');
}

export function isSmsGatewaySentState(state) {
  return SMS_SENT_STATES.has(String(state || ''));
}

export function isSmsGatewayFailedState(state) {
  return SMS_FAIL_STATES.has(String(state || ''));
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

function sleep(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (typeof timer.unref === 'function') timer.unref();
  });
}

async function fetchSmsGatewayJson(url, { method = 'GET', body, config, fetchImpl, timeoutMs = SMS_GATEWAY_TIMEOUT_MS }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (typeof timer.unref === 'function') timer.unref();
  try {
    const response = await fetchImpl(url, {
      method,
      headers: {
        Authorization: buildSmsGatewayAuthHeader(config),
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body } : {}),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  } finally {
    clearTimeout(timer);
  }
}

export async function getSmsGatewayMessage(messageId, {
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const config = getSmsGatewayConfig(env);
  if (!config) return { ok: false, reason: 'missing_sms_gateway_config' };
  const id = String(messageId || '').trim();
  if (!id) return { ok: false, reason: 'missing_message_id' };

  try {
    const { response, data } = await fetchSmsGatewayJson(
      `${config.baseUrl}/messages/${encodeURIComponent(id)}`,
      { config, fetchImpl }
    );
    if (response.status !== 200) {
      return {
        ok: false,
        reason: data?.message || data?.error || `sms_gateway_http_${response.status}`,
        status: response.status,
      };
    }
    return {
      ok: true,
      messageId: data?.id || id,
      state: data?.state || null,
    };
  } catch (error) {
    if (isSmsGatewayAbortError(error)) {
      return { ok: false, reason: 'sms_gateway_timeout' };
    }
    return { ok: false, reason: error?.message || 'sms_gateway_network_error' };
  }
}

export async function cancelSmsGatewayMessage(messageId, {
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const config = getSmsGatewayConfig(env);
  if (!config) return { ok: false, reason: 'missing_sms_gateway_config' };
  const id = String(messageId || '').trim();
  if (!id) return { ok: false, reason: 'missing_message_id' };

  try {
    const { response, data } = await fetchSmsGatewayJson(
      `${config.baseUrl}/messages/${encodeURIComponent(id)}`,
      { method: 'DELETE', config, fetchImpl }
    );
    if (response.status !== 200 && response.status !== 202 && response.status !== 204) {
      return {
        ok: false,
        reason: data?.message || data?.error || `sms_gateway_http_${response.status}`,
        status: response.status,
      };
    }
    return { ok: true, messageId: id };
  } catch (error) {
    if (isSmsGatewayAbortError(error)) {
      return { ok: false, reason: 'sms_gateway_timeout' };
    }
    return { ok: false, reason: error?.message || 'sms_gateway_network_error' };
  }
}

async function waitForSmsGatewaySent(messageId, {
  env,
  fetchImpl,
  waitSentMs = SMS_GATEWAY_WAIT_SENT_MS,
  pollMs = SMS_GATEWAY_POLL_MS,
} = {}) {
  let lastState = 'Pending';
  const deadline = Date.now() + Math.max(0, waitSentMs);
  while (Date.now() <= deadline) {
    const status = await getSmsGatewayMessage(messageId, { env, fetchImpl });
    if (!status.ok) {
      if (Date.now() >= deadline) return { ok: false, reason: status.reason, state: lastState, messageId };
    } else {
      lastState = status.state || lastState;
      if (isSmsGatewaySentState(lastState)) {
        return { ok: true, messageId, state: lastState };
      }
      if (isSmsGatewayFailedState(lastState)) {
        return { ok: false, reason: 'sms_gateway_failed', messageId, state: lastState };
      }
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await sleep(Math.min(pollMs, remaining));
  }
  return { ok: false, reason: 'sms_gateway_still_pending', messageId, state: lastState };
}

export async function sendSmsGatewayMessage({
  phone,
  text,
  env = process.env,
  fetchImpl = fetch,
  waitSentMs = SMS_GATEWAY_WAIT_SENT_MS,
  pollMs = SMS_GATEWAY_POLL_MS,
}) {
  const config = getSmsGatewayConfig(env);
  if (!config) return { ok: false, reason: 'missing_sms_gateway_config' };

  const phoneE164 = toSmsE164(phone);
  if (!phoneE164) return { ok: false, reason: 'invalid_phone' };

  const url = `${config.baseUrl}/messages?deviceActiveWithin=${SMS_GATEWAY_DEVICE_ACTIVE_WITHIN_HOURS}`;
  let response;
  let data;
  try {
    ({ response, data } = await fetchSmsGatewayJson(url, {
      method: 'POST',
      body: JSON.stringify(buildSmsGatewayPayload({ phoneE164, text, config })),
      config,
      fetchImpl,
    }));
  } catch (error) {
    if (isSmsGatewayAbortError(error)) {
      return { ok: false, reason: 'sms_gateway_timeout' };
    }
    return { ok: false, reason: error?.message || 'sms_gateway_network_error' };
  }

  if (response.status !== 200 && response.status !== 202) {
    const msg = data?.message || data?.error || `sms_gateway_http_${response.status}`;
    return { ok: false, reason: String(msg), status: response.status };
  }

  const messageId = data?.id || null;
  const state = data?.state || null;
  if (isSmsGatewaySentState(state)) {
    return { ok: true, messageId, state };
  }
  if (isSmsGatewayFailedState(state)) {
    return { ok: false, reason: 'sms_gateway_failed', messageId, state };
  }
  if (!messageId) {
    return { ok: false, reason: 'sms_gateway_still_pending', state };
  }
  const waited = await waitForSmsGatewaySent(messageId, { env, fetchImpl, waitSentMs, pollMs });
  if (!waited.ok && waited.reason === 'sms_gateway_still_pending') {
    await cancelSmsGatewayMessage(messageId, { env, fetchImpl }).catch(() => null);
  }
  return waited;
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
      state: result.state || null,
      messageId: result.messageId || null,
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
