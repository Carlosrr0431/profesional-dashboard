/**
 * Multi-línea whatsmeow: cada teléfono de negocio → agent_code.
 * API key compartida (WHATSMEOW_API_KEY); la sesión se distingue por agent_code.
 *
 * Env:
 * - WHATSMEOW_API_KEY + WHATSMEOW_AGENT_CODE + WHATSMEOW_PHONE  → línea 1
 * - WHATSMEOW_AGENT_CODE_2 + WHATSMEOW_PHONE_2                  → línea 2
 * - WHATSMEOW_LINES='[{"phone":"549...","agent_code":"..."},...]'
 *
 * Webhooks: POST /api/Agente_IA/<digitos-del-telefono>
 *
 * El campo de contexto `wasender_line` se mantiene por compatibilidad con trips
 * ya guardados (identifica la línea por teléfono de negocio).
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { getWhatsmeowApiKey } from './whatsmeowClient';

const lineStore = new AsyncLocalStorage();

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function phonesMatch(a, b) {
  const da = digitsOnly(a);
  const db = digitsOnly(b);
  if (!da || !db) return false;
  if (da === db) return true;
  return da.endsWith(db) || db.endsWith(da);
}

function readIndexedLine(index) {
  const suffix = index <= 1 ? '' : `_${index}`;
  const agentCode = String(
    process.env[`WHATSMEOW_AGENT_CODE${suffix}`]
    || process.env[`WHATSMEOW_AGENT${suffix}`]
    || ''
  ).trim();
  const phone = String(
    process.env[`WHATSMEOW_PHONE${suffix}`]
    || process.env[`WASENDER_PHONE${suffix}`]
    || (index <= 1 ? (process.env.WASENDER_PHONE || process.env.WASENDER_SESSION_PHONE || '') : '')
    || ''
  ).trim();
  const phoneDigits = digitsOnly(phone);
  const apiKey = getWhatsmeowApiKey();
  if (!agentCode || !phoneDigits || !apiKey) return null;
  return {
    phone: phoneDigits,
    agentCode,
    apiKey,
    label: phone || phoneDigits,
    index,
  };
}

function parseJsonLines() {
  const raw = String(process.env.WHATSMEOW_LINES || process.env.WASENDER_LINES || '').trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const apiKey = getWhatsmeowApiKey();
    return parsed
      .map((item, index) => {
        const agentCode = String(
          item?.agentCode || item?.agent_code || item?.agent || ''
        ).trim();
        const phoneDigits = digitsOnly(item?.phone || item?.telefono || item?.number || '');
        if (!agentCode || !phoneDigits || !apiKey) return null;
        return {
          phone: phoneDigits,
          agentCode,
          apiKey,
          label: String(item?.phone || phoneDigits),
          index: index + 1,
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Línea dedicada a OTPs y comunicaciones de la passenger-app.
 * Por convención es la primera línea (index 1). Se puede sobreescribir
 * con la variable WHATSMEOW_OTP_AGENT_CODE para apuntar a un agentCode específico.
 */
export function getPassengerWhatsmeowLine() {
  const override = String(process.env.WHATSMEOW_OTP_AGENT_CODE || '').trim();
  if (override) {
    const all = listWhatsmeowLines();
    const found = all.find((l) => l.agentCode.toLowerCase() === override.toLowerCase());
    if (found) return found;
  }
  return listWhatsmeowLines()[0] || null;
}

/** @returns {{ phone: string, agentCode: string, apiKey: string, label: string, index: number }[]} */
export function listWhatsmeowLines() {
  const fromJson = parseJsonLines();
  if (fromJson.length > 0) return fromJson;

  const lines = [];
  const primary = readIndexedLine(1);
  if (primary) lines.push(primary);

  for (let i = 2; i <= 10; i += 1) {
    const line = readIndexedLine(i);
    if (line) lines.push(line);
  }

  // Legacy: un solo agent_code sin phone indexado
  if (lines.length === 0) {
    const agentCode = String(process.env.WHATSMEOW_AGENT_CODE || '').trim();
    const apiKey = getWhatsmeowApiKey();
    if (agentCode && apiKey) {
      lines.push({
        phone: digitsOnly(process.env.WHATSMEOW_PHONE || process.env.WASENDER_PHONE || '0') || 'default',
        agentCode,
        apiKey,
        label: 'default',
        index: 1,
      });
    }
  }

  return lines;
}

export function getDefaultWhatsmeowLine() {
  return listWhatsmeowLines()[0] || null;
}

export function resolveWhatsmeowLine(telefonoParam) {
  const needle = digitsOnly(telefonoParam);
  if (!needle) return null;
  return listWhatsmeowLines().find((line) => phonesMatch(line.phone, needle)) || null;
}

export function resolveWhatsmeowLineByAgentCode(agentCode) {
  const code = String(agentCode || '').trim();
  if (!code) return null;
  return listWhatsmeowLines().find(
    (line) => line.agentCode.toLowerCase() === code.toLowerCase()
  ) || null;
}

export function getActiveWhatsmeowLine() {
  return lineStore.getStore() || null;
}

export function getActiveWhatsmeowAgentCode() {
  return getActiveWhatsmeowLine()?.agentCode || getDefaultWhatsmeowLine()?.agentCode || '';
}

export function getActiveWhatsmeowLinePhone() {
  return getActiveWhatsmeowLine()?.phone || getDefaultWhatsmeowLine()?.phone || null;
}

/** Compat: la "API key" activa es la shared WHATSMEOW_API_KEY. */
export function getActiveWhatsmeowApiKey() {
  const active = getActiveWhatsmeowLine();
  if (active?.apiKey) return active.apiKey;
  return getWhatsmeowApiKey() || getDefaultWhatsmeowLine()?.apiKey || '';
}

export function runWithWhatsmeowLine(lineOrPhoneOrAgent, fn) {
  let line = null;
  if (lineOrPhoneOrAgent && typeof lineOrPhoneOrAgent === 'object' && lineOrPhoneOrAgent.agentCode) {
    line = lineOrPhoneOrAgent;
  } else if (lineOrPhoneOrAgent) {
    const raw = String(lineOrPhoneOrAgent);
    line = resolveWhatsmeowLine(raw)
      || resolveWhatsmeowLineByAgentCode(raw)
      || getDefaultWhatsmeowLine();
  } else {
    line = getDefaultWhatsmeowLine();
  }
  return lineStore.run(line, fn);
}

export function injectWhatsmeowLineIntoContext(context = {}) {
  const phone = getActiveWhatsmeowLinePhone();
  const agentCode = getActiveWhatsmeowAgentCode();
  const base = context && typeof context === 'object' ? { ...context } : {};
  if (phone) base.wasender_line = phone; // compat DB
  if (agentCode) base.whatsmeow_agent = agentCode;
  return base;
}

export function extractWhatsmeowLineFromContext(context) {
  if (!context) return null;
  const raw = typeof context === 'string'
    ? (() => {
      try { return JSON.parse(context); } catch { return null; }
    })()
    : context;
  const phone = digitsOnly(raw?.wasender_line || raw?.wasenderLine || raw?.whatsmeow_line || '');
  if (phone) return phone;
  const agent = String(raw?.whatsmeow_agent || raw?.agent_code || '').trim();
  if (agent) {
    const line = resolveWhatsmeowLineByAgentCode(agent);
    return line?.phone || null;
  }
  return null;
}

export function hasAnyWhatsmeowConfig() {
  return Boolean(getWhatsmeowApiKey()) && listWhatsmeowLines().some((l) => Boolean(l.agentCode));
}

export function getWhatsmeowLinesHealth() {
  return {
    lines: listWhatsmeowLines().map(({ phone, label, index, agentCode }) => ({
      phone,
      label,
      index,
      agentCode,
      hasApiKey: Boolean(getWhatsmeowApiKey()),
    })),
    activePhone: getActiveWhatsmeowLinePhone(),
    activeAgentCode: getActiveWhatsmeowAgentCode(),
  };
}

// ── Aliases compat Wasender (mismo contrato de exports) ──────────────────────
export const listWasenderLines = listWhatsmeowLines;
export const getDefaultWasenderLine = getDefaultWhatsmeowLine;
export const resolveWasenderLine = resolveWhatsmeowLine;
export const getActiveWasenderLine = getActiveWhatsmeowLine;
export const getWasenderApiKey = getActiveWhatsmeowApiKey;
export const getActiveWasenderLinePhone = getActiveWhatsmeowLinePhone;
export const runWithWasenderLine = runWithWhatsmeowLine;
export const injectWasenderLineIntoContext = injectWhatsmeowLineIntoContext;
export const extractWasenderLineFromContext = extractWhatsmeowLineFromContext;
export const hasAnyWasenderApiKey = hasAnyWhatsmeowConfig;
export const getWasenderLinesHealth = getWhatsmeowLinesHealth;
